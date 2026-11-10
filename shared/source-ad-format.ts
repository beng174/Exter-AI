import type {AdFormat} from "./public-comparisons.js";
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Explicit source metadata only. Missing media files do not erase the observed format. */
export function sourceAdFormat(value:unknown):AdFormat|null {
 const row=object(value),snapshot=object(row.snapshot),explicit=row.source_format||row.display_format||row.displayFormat||row.creative_format||row.media_type||row.mediaType||snapshot.display_format||snapshot.displayFormat;
 const formats:Record<string,AdFormat>={VIDEO:"video",IMAGE:"static_image",STATIC_IMAGE:"static_image",STATIC:"static_image",CAROUSEL:"carousel",MULTI_IMAGES:"carousel",DPA:"catalogue",DCO:"catalogue",CATALOGUE:"catalogue",CATALOG:"catalogue"};
 if(typeof explicit==="string"&&formats[explicit.toUpperCase()])return formats[explicit.toUpperCase()];
 const cards=Array.isArray(row.cards||snapshot.cards)?(row.cards||snapshot.cards) as unknown[]:[];
 if(cards.length>1)return "carousel";
 const card=object(cards[0]),hasVideo=(item:Record<string,unknown>)=>["video_hd_url","video_sd_url","videoHdUrl","videoSdUrl","video_url","videoUrl"].some(key=>typeof item[key]==="string"&&Boolean(item[key]));
 if(hasVideo(row)||hasVideo(snapshot)||hasVideo(card)||[row.videos,snapshot.videos].some(list=>Array.isArray(list)&&list.length))return "video";
 if([row.images,snapshot.images].some(list=>Array.isArray(list)&&list.length)||[row,snapshot,card].some(item=>["image_url","imageUrl","original_image_url","originalImageUrl"].some(key=>typeof item[key]==="string"&&Boolean(item[key]))))return "static_image";
 return null;
}
