/** HTML enriquecido con etiquetas permitidas. Nunca renderizar HTML guardado sin sanitizar. */
const allowed=new Set(['P','DIV','H2','H3','B','STRONG','I','EM','U','S','BR','UL','OL','LI','BLOCKQUOTE','A']);
function cleanUrl(value:string|null):string|null {
  if(!value)return null;
  try {
    const u=new URL(value);
    return u.protocol==='https:' || u.protocol==='http:'?u.href:null;
  } catch {return null;}
}
export function safeRichText(input:string):string {
  if(typeof document==='undefined'||typeof DOMParser==='undefined')return '';
  const parsed=new DOMParser().parseFromString(input,'text/html');
  const fragment=document.createDocumentFragment();
  const copy=(source:Node,parent:Node,depth:number):void=>{
    if(depth>35)return;
    if(source.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(source.textContent??''));return;}
    if(source.nodeType!==Node.ELEMENT_NODE)return;
    const element=source as Element;
    // Nunca recuperar contenido dentro de tags ejecutables/no editoriales.
    if(['SCRIPT','STYLE','SVG','MATH','IFRAME','OBJECT','FORM','IMG','VIDEO','AUDIO'].includes(element.tagName))return;
    const permitted=allowed.has(element.tagName);
    const target=permitted?document.createElement(element.tagName.toLowerCase()):parent;
    if(permitted){
      if(element.tagName==='A'){
        const url=cleanUrl(element.getAttribute('href'));
        if(url){(target as HTMLAnchorElement).href=url;(target as HTMLAnchorElement).target='_blank';(target as HTMLAnchorElement).rel='noopener noreferrer';}
      }
      parent.appendChild(target);
    }
    for(const child of Array.from(element.childNodes))copy(child,target,depth+1);
  };
  for(const child of Array.from(parsed.body.childNodes))copy(child,fragment,0);
  const wrapper=document.createElement('div');wrapper.appendChild(fragment);
  return wrapper.innerHTML.slice(0,30000);
}
export function textLength(html:string):number {
  const wrapper=document.createElement('div');
  wrapper.innerHTML=safeRichText(html);
  return (wrapper.textContent??'').trim().length;
}
