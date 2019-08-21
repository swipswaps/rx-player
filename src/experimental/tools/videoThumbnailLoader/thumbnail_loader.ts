/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  EMPTY,
  merge as observableMerge,
  Observable,
  of as observableOf,
  Subject,
  Subscription,
} from "rxjs";
import {
  catchError,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  mapTo,
  mergeMap,
  shareReplay,
  switchMap,
  take,
} from "rxjs/operators";
import { QueuedSourceBuffer } from "../../../core/source_buffers";
import { Representation } from "../../../manifest";
import arrayFindIndex from "../../../utils/array_find_index";
import castToObservable from "../../../utils/cast_to_observable";
import PPromise from "../../../utils/promise";
import {
  areRangesOverlapping,
  convertToRanges,
} from "../../../utils/ranges";
import request from "../../../utils/request";
import prepareSourceBuffer from "./media_source";

interface IThumbnailInfo {
  start: number;
  duration: number;
  mediaURL: string;
}

interface IThumbnailTrack {
  thumbnailInfos: IThumbnailInfo[];
  initURL: string;
  codec: string;
}

const MAXIMUM_MEDIA_BUFFERED = 2;

/**
 * Load needed segment data.
 * @param {Object} thumbnails
 * @param {HTMLMediaElement} mediaElement
 */
function getSegmentsData(
  thumbnails: IThumbnailInfo[],
  mediaElement: HTMLMediaElement
): Observable<ArrayBuffer> {

  const thumbnailsToLoad = thumbnails.filter((t) => {
    const tRange = { start: t.start, end: t.start + t.duration };
    const mediaRanges = convertToRanges(mediaElement.buffered);
    return arrayFindIndex(mediaRanges, (mr) => {
      return tRange.start >= mr.start && tRange.end <= mr.end;
    }) === -1;
  });

  if (!thumbnailsToLoad.length) {
    return EMPTY;
  }

  const loadedData$ = thumbnailsToLoad.map(({ mediaURL }) => {
    return request({
      url: mediaURL,
      responseType: "arraybuffer",
    }).pipe(take(1));
  });

  return observableMerge(...loadedData$).pipe(
    map(({ value: { responseData }}) => {
      return responseData;
    })
  );
}

/**
 * This tool, as a supplement to the RxPlayer, intent to help creating thumbnails
 * from a video source.
 *
 * From a given video adaptation, the tools will extract a "thumbnail track",
 * either from a trickMode track (whose light chunks are adapted from such use case)
 * or direclty from the media content.
 */
export default class VideoThumbnailLoader {
  private readonly _thumbnailVideoElement: HTMLVideoElement;
  private readonly _bufferedDataRanges: Array<{
    start: number;
    end: number;
  }>;

  private _thumbnailTrack: IThumbnailTrack;

  private _setTime$: Subject<{ time: number;
                               resolve: () => void;
                               reject: (err: Error) => void; }>;
  private _setTimeSubscription$: Subscription;

  constructor(
    videoElement: HTMLVideoElement,
    trickModeTrack: Representation
  ) {
    // readonly
    this._thumbnailVideoElement = videoElement;
    this._bufferedDataRanges = [];

    // nullable
    this._thumbnailTrack = this.updateThumbnailTrack(trickModeTrack);
    this._setTime$ = new Subject();

    const videoSourceInfos$ = prepareSourceBuffer(
      this._thumbnailVideoElement,
      this._thumbnailTrack.codec
    ).pipe(
      mergeMap((videoSourceBuffer) => {
        const { initURL: init, codec } = this._thumbnailTrack;
        return request({ url: init,
                         responseType: "arraybuffer",
        }).pipe(
          mergeMap((e) => {
            const { value: { responseData }} = e;
            return videoSourceBuffer.appendBuffer({
              initSegment : responseData,
              segment: null,
              codec,
              timestampOffset: 0,
              appendWindow: [undefined, undefined],
            });
          }),
          mapTo(videoSourceBuffer)
        );
      }),
      catchError(() => {
        throw new Error("VideoThumbnailLoaderError: Couldn't open media source.");
      }),
      shareReplay()
    );

    this._setTimeSubscription$ = this._setTime$.pipe(
      filter(({ time }, i) => {
        return time !== this._thumbnailVideoElement.currentTime || i === 0;
      }),
      map((payload) => {
        if (!this._thumbnailTrack) {
          throw new Error(
            "VideoThumbnailLoaderError: No thumbnail track given.");
        }

        const thumbnails: IThumbnailInfo[] | undefined =
          this._thumbnailTrack.thumbnailInfos
            .filter((t) => {
              const thumbnailDuration = t.duration;
              const range = { start: payload.time - thumbnailDuration,
                              end: payload.time + thumbnailDuration };
              const tRange = { start: t.start, end: t.start + t.duration };
              return areRangesOverlapping(range, tRange);
            });

      if (thumbnails.length === 0) {
        throw new Error(
          "VideoThumbnailLoaderError: Couldn't find thumbnail.");
      }

      return { thumbnails, payload };
    }),
    distinctUntilChanged((a, b) => {
      if (a.thumbnails.length !== b.thumbnails.length) {
        return false;
      }
      for (let i = 0; i < a.thumbnails.length; i++) {
        if (a.thumbnails[i].start !== b.thumbnails[i].start ||
            a.thumbnails[i].duration !== b.thumbnails[i].duration ||
            a.thumbnails[i].mediaURL !== b.thumbnails[i].mediaURL) {
          return false;
        }
      }
      return true;
    }),
    switchMap(({ thumbnails, payload: { time, resolve, reject } }) => {
      return videoSourceInfos$.pipe(
        mergeMap((videoSourceBuffer) => {
          return castToObservable(this.removeBuffers(videoSourceBuffer, time)).pipe(
            mergeMap(() => {
              if (!this._thumbnailTrack) {
                throw new Error(
                  "VideoThumbnailLoaderError: No thumbnail track given.");
              }

              return getSegmentsData(thumbnails, videoElement).pipe(
                mergeMap((data) => {
                  if (data) {
                    const appendBuffer$ = videoSourceBuffer
                      .appendBuffer({
                        segment: data,
                        initSegment: null,
                        codec: this._thumbnailTrack.codec,
                        timestampOffset: 0,
                        appendWindow: [undefined, undefined],
                      });
                    return appendBuffer$.pipe(
                        mergeMap(() => {
                          thumbnails.forEach((t) => {
                            this._bufferedDataRanges.push({
                              start: t.start,
                              end: t.start + t.duration,
                            });
                          });
                          this._thumbnailVideoElement.currentTime = time;
                          return observableOf(null);
                        }),
                        catchError((err) => {
                          throw new Error(
                            "VideoThumbnailLoaderError: Couldn't append buffer :" +
                            err.message || err
                          );
                        })
                      );
                  }
                  return observableOf(null);
                }),
                finalize(() => {
                  resolve();
                })
              );
            }));
          }),
          catchError((err) => {
            reject(err);
            return EMPTY;
          })
        );
      }),
      catchError((err) => {
        this.dispose();
        throw err;
      })
    ).subscribe();
  }

  /**
   * Set time of thumbnail video media element :
   * - Remove buffer when too much buffered data
   * - Search for thumbnail track element to display
   * - Load data
   * - Append data
   * Resolves when time is set.
   * @param {number} time
   * @returns {Promise}
   */
  setTime(time: number) {
    return new Promise((resolve, reject) => {
      this._setTime$.next({ time, resolve, reject });
    });
  }

  /**
   * Update thumbnail track from adaptation
   * @param {Object} adaptation
   * @returns {Object}
   */
  public updateThumbnailTrack(trickModeTrack: Representation): IThumbnailTrack {
    const trackIndex = trickModeTrack.index;
    const indexStart = trackIndex.getFirstPosition();
    const indexEnd = trackIndex.getLastPosition();

    if (indexStart != null && indexEnd != null) {
      const segments = trackIndex.getSegments(indexStart, indexEnd - indexStart);

      const thumbnailInfos = segments
        .filter((s) => s.duration != null && s.mediaURL != null)
        .map((s) => {
          return {
            duration: (s.duration || 0) / s.timescale,
            start: s.time / s.timescale,
            mediaURL: s.mediaURL || "",
          };
        });
      const initSegment =
        trickModeTrack.index.getInitSegment();
      return {
        thumbnailInfos,
        codec: trickModeTrack.getMimeTypeString(),
        initURL: initSegment ? (initSegment.mediaURL || "") : "",
      };
    } else {
      throw new Error(
        "VideoThumbnailLoaderError: Can't get segments from trick mode track.");
    }
  }

  /**
   * Dispose thumbnail loader.
   * @returns {Observable}
   */
  dispose(): void {
    this._setTimeSubscription$.unsubscribe();
    return;
  }

  /**
   * @param {Object} videoSourceBuffer
   * @returns {Promise}
   */
  private removeBuffers<T>(
    videoSourceBuffer: QueuedSourceBuffer<T>,
    time: number
  ): Promise<unknown> {
    const bufferToRemove: Array<{
      start: number;
      end: number;
    }> = [];
    while (this._bufferedDataRanges.length > MAXIMUM_MEDIA_BUFFERED) {
      const newBuffer = this._bufferedDataRanges.shift();
      if (newBuffer) {
        bufferToRemove.push(newBuffer);
      }
    }

    const removeBufferActions$: Array<Promise<void>> = [];
    bufferToRemove.forEach(({ start, end }) => {
      const prm = videoSourceBuffer.removeBuffer(start, end)
        .toPromise(PPromise).then(() => {
          const bufferIdx =
            arrayFindIndex(this._bufferedDataRanges, ({ start: s, end: e }) => {
              return s <= time && e > time;
            });
          if (bufferIdx > -1) {
            this._bufferedDataRanges.splice(bufferIdx, 1);
          }
        });
      removeBufferActions$.push(prm);
    });
    return PPromise.all(removeBufferActions$);
  }
}