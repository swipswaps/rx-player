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

import TimelineIndex from "./timeline.js";
import {
  getTimelineRangeEnd,
  getInitSegment,
  setTimescale,
  scale,
} from "./helpers.js";

export default {
  getSegments: TimelineIndex.getSegments, // TODO Re-implement?
  getInitSegment,
  checkDiscontinuity: TimelineIndex.checkDiscontinuity, // TODO Re-implement?
  _addSegmentInfos: TimelineIndex._addSegmentInfos,
  setTimescale,
  scale,

  shouldRefresh(index, time) {
    const {
      timeline,
      timescale,
      presentationTimeOffset = 0,
    } = index;

    const scaledTime = time * timescale - presentationTimeOffset;
    let last = timeline[timeline.length - 1];
    if (!last) {
      return false;
    }

    if (last.d < 0) {
      last = { ts: last.ts, d: 0, r: last.r };
    }

    return scaledTime >= getTimelineRangeEnd(last);
  },

  getFirstPosition(index) {
    if (!index.timeline.length) {
      return undefined;
    }
    return index.timeline[0].ts / index.timescale;
  },

  getLastPosition(index) {
    if (!index.timeline.length) {
      return undefined;
    }
    const lastTimelineElement = index.timeline[index.timeline.length - 1];
    return (getTimelineRangeEnd(lastTimelineElement) / index.timescale);
  },
};