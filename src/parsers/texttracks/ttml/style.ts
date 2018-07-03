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

import arrayFind from "array-find";
import arrayIncludes from "../../../utils/array-includes";
import startsWith from "../../../utils/starts-with";

export interface IStyleList {
  [styleName: string] : string;
}

export interface IStyleObject {
  id: string;
  style: IStyleList;
}

/**
 * Retrieve the attributes given in arguments in the given nodes and their
 * associated style(s)/region.
 * The first notion of the attribute encountered will be taken (by looping
 * through the given nodes in order).
 *
 * TODO manage IDREFS (plural) for styles and regions, that is, multiple one
 * @param {Array.<string>} attributes
 * @param {Array.<Node>} nodes
 * @param {Array.<Object>} styles
 * @param {Array.<Object>} regions
 * @returns {Object}
 */
export function getStylingAttributes(
  attributes : string[],
  nodes : Node[],
  styles : IStyleObject[],
  regions : IStyleObject[]
) : IStyleList {
  const currentStyle : IStyleList = {};
  const leftAttributes = attributes.slice();
  for (let i = 0; i <= nodes.length - 1; i++) {
    const node = nodes[i];
    if (node) {
      let styleID : string|undefined;
      let regionID : string|undefined;

      // 1. the style is directly set on a "tts:" attribute
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        for (let j = 0; j <= element.attributes.length - 1; j++) {
          const attribute = element.attributes[j];
          const name = attribute.name;
          if (name === "style") {
            styleID = attribute.value;
          } else if (name === "region") {
            regionID = attribute.value;
          } else {
            const nameWithoutTTS = name.substr(4);
            if (arrayIncludes(leftAttributes, nameWithoutTTS)) {
              currentStyle[nameWithoutTTS] = attribute.value;
              leftAttributes.splice(j, 1);
              if (!leftAttributes.length) {
                return currentStyle;
              }
            }
          }
        }
      }

      // 2. the style is referenced on a "style" attribute
      if (styleID) {
        const style = arrayFind(styles, (x) => x.id === styleID);
        if (style) {
          for (let j = 0; j <= leftAttributes.length - 1; j++) {
            const attribute = leftAttributes[j];
            if (!currentStyle[attribute]) {
              if (style.style[attribute]) {
                currentStyle[attribute] = style.style[attribute];
                leftAttributes.splice(j, 1);
                if (!leftAttributes.length) {
                  return currentStyle;
                }
                j--;
              }
            }
          }
        }
      }

      // 3. the node reference a region (which can have a value for the
      //    corresponding style)
      if (regionID) {
        const region = arrayFind(regions, (x : IStyleObject) =>
          x.id === regionID
        );
        if (region) {
          for (let j = 0; j <= leftAttributes.length - 1; j++) {
            const attribute = leftAttributes[j];
            if (!currentStyle[attribute]) {
              if (region.style[attribute]) {
                currentStyle[attribute] = region.style[attribute];
                leftAttributes.splice(j, 1);
                if (!leftAttributes.length) {
                  return currentStyle;
                }
                j--;
              }
            }
          }
        }
      }
    }
  }
  return currentStyle;
}

/**
 * Returns the styling directly linked to an element.
 * @param {Node} node
 * @returns {Object}
 */
export function getStylingFromElement(node : Node) : IStyleList {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return {};
  }
  const element = node as Element;
  const currentStyle : IStyleList = {};
  for (let i = 0; i <= element.attributes.length - 1; i++) {
    const styleAttribute = element.attributes[i];
    if (startsWith(styleAttribute.name, "tts")) {
      const nameWithoutTTS = styleAttribute.name.substr(4);
      currentStyle[nameWithoutTTS] = styleAttribute.value;
    }
  }
  return currentStyle;
}