import { decodeImageHtml, imageAttributes, imageElementBody, galleryImageUrls } from './gallery-evidence.mjs';
import { manufacturerImageKey } from './image-variants.mjs';
const capacities = value => [...String(value || '').matchAll(/(?:^|[^\da-z.])(\d+(?:[.,_-]\d+)?)[ _-]*(?:l\b|litres?\b|liters?\b)/gi)].map(m => Number(m[1].replace(/[,_-]/, '.')));
export function tailfinGalleryEvidence(html, entry) {
  const tags = [...String(html).matchAll(/<div\b[^>]*>/gi)];
  const components = new Map(tags.map(m=>imageAttributes(m[0])).filter(a=>/\bcomposite_component\b/.test(a.class||'')).map(a=>[a['data-item_id'],a['data-nav_title']||'']));
  const groups = [...html.matchAll(/\bdata-options_data\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m=>JSON.parse(decodeImageHtml(m[1]??m[2])));
  const scenarioMatch = html.match(/\bdata-scenario_data\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const scenarios = scenarioMatch ? JSON.parse(decodeImageHtml(scenarioMatch[1]??scenarioMatch[2])) : {};
  const settings = scenarios.scenario_settings || {};
  const root = tags.find(m=>/\bwoocommerce-product-gallery\b/.test(imageAttributes(m[0]).class||''));
  const defaults = root ? galleryImageUrls(imageElementBody(html,root.index),entry.sourceUrl) : [];
  const sourceOptions = [];
  for (const options of groups) for (const option of options) {
    const component = String(option.component_id), title = components.get(component) || '';
    if (!/size|bag type|^add bags$/i.test(title) || /accessor|strap|cage$|add a top tube/i.test(title)) continue;
    const data = option.option_product_data || {};
    if (Array.isArray(data.variations_data) && data.variations_data.length) {
      for (const variation of data.variations_data) {
        const sizes = Object.entries(variation.attributes || {}).filter(([name])=>/size|volume/i.test(name)).flatMap(([,value])=>capacities(value));
        sourceOptions.push({component, id:String(variation.variation_id), volumes:sizes.length?sizes:capacities(option.option_title),
          image:variation.image?.full_src||variation.image?.src||data.image_data?.image_src||'', manufacturerSku:variation.sku});
      }
    } else sourceOptions.push({component,id:String(option.option_id),volumes:capacities(option.option_title),image:data.image_data?.image_src||''});
  }
  return (entry.variants || []).flatMap(variant=>{
    const volume=variant.volume||entry.volume;
    const options=sourceOptions.filter(option=>option.volumes.includes(volume));
    const images=[];
    for(const option of options) {
      const applicable=new Set(scenarios.scenario_data?.[option.component]?.[option.id]||[]);
      const ordered=(scenarios.scenarios||[]).filter(id=>applicable.has(id) && Object.entries(scenarios.scenario_data || {}).every(([component, choices]) => {
        if (component === option.component || (settings.masked_components?.[id] || []).includes(component)) return true;
        // Do not activate a gallery that depends on an unselected accessory or a
        // different component. Such a choice requires a complete configuration.
        return Object.entries(choices).filter(([key]) => key !== '0').every(([,ids]) => ids.includes(id));
      }));
      const overlays=ordered.flatMap(id=>galleryImageUrls(settings.overlay_image?.[id]||'',entry.sourceUrl));
      const replacement=ordered.filter(id=>settings.replace_gallery_images?.[id]).at(-1);
      const extras=replacement ? (settings.replace_gallery_images[replacement].items||[]).flatMap(item=>item.type==='image'?galleryImageUrls(item.html||'',entry.sourceUrl):[]) : defaults.slice(1);
      // The source's selected image/overlay is authoritative; all unmodified extra slides are shared by its own gallery.
      const primary=overlays.length?overlays:option.image?[option.image]:defaults.slice(0,1);
      const familyVolumes=new Set((entry.variants||[]).map(v=>v.volume));
      images.push(...primary,...extras.filter(url=>{
        const explicit=capacities(manufacturerImageKey(url)).filter(v=>familyVolumes.has(v));
        return !explicit.length||explicit.includes(volume);
      }));
    }
    return images.length?[{sku:variant.sku,volume,sourceUrl:entry.sourceUrl,sourceImageUrls:[...new Map(images.map(url=>[manufacturerImageKey(url),url])).values()]}]:[];
  });
}
