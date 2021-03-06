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

export type ILocalManifestInitSegmentLoader = (
  callbacks : { resolve : (args: { data : ArrayBuffer | null }) => void;

                reject : (err? : Error) => void; }
  // returns either the aborting callback or nothing
) => (() => void) | void;

export type ILocalManifestSegmentLoader = (
  segment : ILocalIndexSegment, // Same than the segment from `segments`
  callbacks : { resolve : (args: { data : ArrayBuffer }) => void;

                reject : (err? : Error) => void; }
  // returns either the aborting callback or nothing
) => (() => void) | void;

export interface IContentProtectionKID { keyId : Uint8Array;
                                         systemId?: string; }

export interface IContentProtectionInitData { systemId : string;
                                              data : Uint8Array; }

export interface IContentProtections {
  keyIds : IContentProtectionKID[];
  initData : Partial<Record<string, IContentProtectionInitData[]>>;
}

export interface ILocalIndexSegment {
  time : number; // Start time of the segment, timescaled
  duration : number; // Duration of the segment, timescaled
  timestampOffset? : number; // If set, the amount of time we have to add to the
                             // segment to convert its media time to its
                             // presentation time, in seconds
}

export interface ILocalIndex {
  loadInitSegment : ILocalManifestInitSegmentLoader;
  loadSegment : ILocalManifestSegmentLoader;
  segments : ILocalIndexSegment[];
}

export interface ILocalRepresentation {
  bitrate : number; // bitrate of the content in bps
  contentProtections? : IContentProtections;
  mimeType : string; // same than in the DASH MPD
  codecs : string; // same than in the DASH MPD
  width? : number;
  height? : number;
  index : ILocalIndex;
}

export interface ILocalAdaptation {
  type : "audio" | "video" | "text";
  audioDescription? : boolean; // self-explanatory
  closedCaption? : boolean;
  language? : string; // ISO 639-3 code
  representations: ILocalRepresentation[];
}

export interface ILocalPeriod {
  start: number; // the time at which the content begins in this period in ms
  duration: number; // total duration of this period in ms
  adaptations: ILocalAdaptation[];
}

export interface ILocalManifest {
  type : "local";
  version : string; // MAJOR.MINOR
                    // MAJOR = previous parser should not parse it
                    // MINOR = retro-compatible
  duration : number; // total duration of the content in ms
  expired? : Promise<void>; // When this Promise resolves, it means that the
                            // Local Manifest needs to be updated.
  periods : ILocalPeriod[];
  isFinished : boolean; // whether the local-manifest generation is finished
}
