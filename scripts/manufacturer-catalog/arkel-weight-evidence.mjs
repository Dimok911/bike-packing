const numbers = text => [...String(text).matchAll(/(\d+(?:[.,]\d+)?|[.,]\d+)\s*(kg|grams?|gr|g)\b/gi)].map(m => Math.round(Number(m[1].replace(',', '.')) * (m[2].toLowerCase() === 'kg' ? 1000 : 1)));
const volumes = text => [...String(text).matchAll(/(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:L\b|lit(?:er|re)s?\b)/gi)].map(m => Number(m[1].replace(',', '.')));
const plain = html => String(html).replace(/<br\s*\/?\s*>|<\/(?:p|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/[ \t\u00a0]+/g,' ').replace(/\n\s+/g,'\n').trim();

export function arkelWeightGroups(html) {
  const blocks = [...String(html).matchAll(/<(div|span)\b[^>]*class=["'][^"']*metafield-(?:rich_text|multi_line_text)_field[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>plain(m[2]));
  const groups=[];
  for (const block of blocks) {
    const chunks=block.split(/\n(?=(?:Small|Medium|Large|Burrito\s+\d|Seatpacker\s+\d|Rollpacker\s+\d|Dry-Lite\s+\d|Orca\s+\d|Specs for (?:the pair|1 bag)|Capacity\s*:\s*\d))/i);
    for(const text of chunks) {
      const lines=text.split('\n');
      const weights=lines.filter(l=>/^[-•* ]*(?:(?:total|bag)\s+)?weight\b/i.test(l) && !/weight\s+(?:capacity|limit)|maximum\s+weight/i.test(l)).map(line=>({line,values:numbers(line)})).filter(r=>r.values.length);
      if(!weights.length)continue;
      const volumeLines=lines.filter(l=>/^[-•* ]*(?:per unit\s*-\s*)?(?:total\s+)?(?:volume|capacity)\b/i.test(l));
      const unitLine=volumeLines.find(l=>/for the unit|per bag/i.test(l));
      const volumeValues=volumes(unitLine || volumeLines.join('\n') || lines[0]);
      groups.push({text,weights,volumes:volumeValues});
    }
  }
  return groups;
}

export function arkelWeightEvidence(html, {volume=0, soldAsSet=false, handle=''}={}) {
  const groups=arkelWeightGroups(html);
  let selected=groups.filter(g=>g.volumes.includes(Number(volume)));
  if(!selected.length && groups.length===1 && (!volume || !groups[0].volumes.length))selected=groups;
  if(!selected.length && soldAsSet)selected=groups.filter(g=>/^Specs for the pair/im.test(g.text)&&g.volumes.includes(Number(volume)*2));
  // Pair and unit specifications can be separate blocks on the same page.
  if(selected.length>1)selected=selected.filter(g=>soldAsSet?/Specs for the pair/i.test(g.text):!/Specs for the pair/i.test(g.text));
  if(selected.length>1 && new Set(selected.map(g=>JSON.stringify(g.weights.flatMap(r=>r.values)))).size===1)selected=selected.slice(-1);
  if(selected.length!==1)return null;
  const group=selected[0];let rows=group.weights;
  const explicitKind=rows.filter(r=>soldAsSet?/weight\s*(?:for the pair|\(pair\))/i.test(r.line):/weight\s*(?:for the unit|\(per bag\))/i.test(r.line));
  if(explicitKind.length)rows=explicitKind;
  const total=rows.find(r=>/^[-•* ]*total weight\b/i.test(r.line)||/weight of hanger and bag/i.test(r.line));
  let values;
  if(total)values=total.values;
  else {
    const bag=rows.find(r=>/weight of seat bag/i.test(r.line)),hanger=rows.find(r=>/weight of hanger/i.test(r.line));
    if(bag&&hanger&&bag.values.length===1&&hanger.values.length===1)values=[bag.values[0]+hanger.values[0]];
    else values=rows.flatMap(r=>r.values);
  }
  // This source prints two matching columns on the same lines, in source order.
  if(handle==='arkel-forkpacker-omm-flip-fork-bag-and-cage' && group.volumes.length===values.length)values=[values[group.volumes.indexOf(Number(volume))]];
  if(soldAsSet && !explicitKind.length && /(?:sold as a unit|specs for 1 (?:bag|pannier)|for 1 unit)/i.test(group.text))values=values.map(v=>v*2);
  values=[...new Set(values)].filter(v=>v>=20&&v<10000);
  return values.length?{weight:values[0],weightOptions:[...values].sort((a,b)=>a-b),evidence:rows.map(r=>r.line).join('\n')}:null;
}

export function applyArkelWeightEvidence(entry, html) {
  const handle=String(entry.sourceProductId||entry.id).replace(/^arkel-/,'');
  const found=arkelWeightEvidence(html,{volume:entry.volume,soldAsSet:entry.soldAsSet,handle});
  if(!found)return {...entry,weightEvidenceMissing:true};
  const quantity=entry.specificationBasis==='per-bag'?Number(entry.setQuantity||2):1;
  const weight=found.weight/quantity, weightOptions=found.weightOptions.map(v=>v/quantity);
  return {...entry,weight,weightOptions,variantWeightsAuthoritative:true,weightEvidenceMissing:false,
    weightSource:'manufacturer-specifications',weightEvidence:found.evidence,
    variants:(entry.variants||[]).map(v=>({...v,weight})),
    ...(quantity>1?{weightPerBag:weight,weightPerBagOptions:weightOptions,totalWeight:found.weight,totalWeightOptions:found.weightOptions}:{})};
}

// A missing visible specification must not promote Shopify inventory grams.
export function preserveUnverifiedArkelWeight(entry, approved) {
  if(entry.brand !== 'Arkel' || !entry.weightEvidenceMissing) return entry;
  const keys=['weight','weightOptions','weightPerBag','weightPerBagOptions','totalWeight','totalWeightOptions'];
  const result={...entry, weightSource:approved?'previous-catalog':'unverified',weight:0,weightOptions:[],variants:(entry.variants||[]).map(v=>({...v,weight:approved?.variants?.find(old=>old.sku===v.sku)?.weight||0}))};
  for(const key of keys) if(approved && Object.hasOwn(approved,key))result[key]=structuredClone(approved[key]);
  return result;
}
