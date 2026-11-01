<script lang="ts">
 import {tick,onDestroy,getContext} from 'svelte';
 import {localization} from '$lib/localization';
 import {codeLanguageOptions,openingCodeFence,type CodeLanguageOption} from '$lib/project-markdown-editor';
 import FormTextarea from '$lib/components/FormTextarea.svelte';
 import FormInput from '$lib/components/FormInput.svelte';
 import ActionButton from '$lib/components/ActionButton.svelte';
 import MarkdownBody from './MarkdownBody.svelte';
 import MarkdownToolButton from './MarkdownToolButton.svelte';
 import StatusNotice from '$lib/components/StatusNotice.svelte';
 type ImageContext={target:'project'|'ticket'|'comment';project?:string;ticket?:string;comment?:number};
 let {label,field,value='',placeholder,maxlength=20000,disabled=false,labelToolbar=false,imageContext,onValueChange,onUploadState}:{label:string;field:string;value?:string;placeholder?:string;maxlength?:number;disabled?:boolean;labelToolbar?:boolean;imageContext?:ImageContext;onValueChange:(value:string)=>void;onUploadState?:(uploading:boolean)=>void}=$props();
 let ja=$derived($localization.displayLanguage==='ja');const tr=(j:string,e:string)=>ja?j:e;
 let preview=$state(true),mobileTab=$state('edit'),textarea=$state<HTMLTextAreaElement>(),panel=$state<HTMLDivElement>(),search=$state(''),selected=$state(0),expanded=$state(false),left=$state(8),top=$state(8),composing=false;
 let fence:{from:number;to:number}|null=null;
 let imageInput=$state<HTMLInputElement>(),uploading=$state(false),imageError=$state('');
 const drafts=new Set<string>();let destroyed=false;
 const allowed=getContext<(code:string)=>boolean>('operation-allowed')??(()=>false);
 let imageAllowed=$derived(allowed('projects.images.create'));
 const cleanup=(key:string)=>fetch('/v1/project-markdown-images/'+key,{method:'DELETE',keepalive:true}).catch(()=>{});
 onDestroy(()=>{destroyed=true;for(const key of drafts)void cleanup(key);});
 const rank=(o:CodeLanguageOption)=>{const q=search.trim().toLowerCase();return o.id===q||o.name.toLowerCase()===q?0:o.aliases?.includes(q)?1:o.id.startsWith(q)||o.name.toLowerCase().startsWith(q)?2:3;};
 let options=$derived(codeLanguageOptions.filter(o=>(o.id+' '+o.name+' '+(o.aliases??[]).join(' ')).toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>rank(a)-rank(b)));
 function close(){expanded=false;panel?.hidePopover();}
 function position(){
  if(!textarea||!panel||!expanded)return;
  const r=textarea.getBoundingClientRect(),style=getComputedStyle(textarea),mirror=document.createElement('div'),caret=document.createElement('span');
  for(const property of ['box-sizing','font-family','font-size','font-weight','line-height','letter-spacing','tab-size','padding','border-width','border-style','overflow-wrap'])mirror.style.setProperty(property,style.getPropertyValue(property));
  Object.assign(mirror.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',visibility:'hidden',whiteSpace:'pre-wrap',pointerEvents:'none'});
  mirror.textContent=textarea.value.slice(0,textarea.selectionStart);caret.textContent='\u200b';mirror.append(caret);document.body.append(mirror);
  const point=caret.getBoundingClientRect();mirror.remove();
  left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,point.left-textarea.scrollLeft));
  const below=point.bottom-textarea.scrollTop+6;
  top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,below));
 }
 async function changed(next:string,inputType=''){onValueChange(next);if(inputType.startsWith('history')){close();return;}if(composing||!textarea)return;fence=openingCodeFence(next,textarea.selectionStart);if(!fence){close();return;}search='';selected=0;expanded=true;await tick();panel?.showPopover();position();panel?.querySelector('input')?.focus({preventScroll:true});}
 function replaceRange(text:string,from:number,to:number){
  if(!textarea)return;const wasDisabled=textarea.disabled;textarea.disabled=false;textarea.focus({preventScroll:true});textarea.setSelectionRange(from,to);
  // The browser's editing command retains its native undo transaction. No HTML is inserted.
  if(!document.execCommand('insertText',false,text))textarea.setRangeText(text,from,to,'end');
  textarea.disabled=wasDisabled;onValueChange(textarea.value);
 }
 async function insert(before:string,after=''){if(!textarea||disabled)return;close();const from=textarea.selectionStart,to=textarea.selectionEnd;replaceRange(before+value.slice(from,to)+after,from,to);await tick();textarea.focus({preventScroll:true});textarea.setSelectionRange(from+before.length,from+before.length+(to-from));}
 async function insertBlock(make:(selection:string)=>string){
  if(!textarea||disabled)return;close();const from=textarea.selectionStart,to=textarea.selectionEnd;
  const text=(from>0&&value[from-1]!=='\n'?'\n':'')+make(value.slice(from,to))+(to<value.length&&value[to]!=='\n'?'\n':'');
  replaceRange(text,from,to);await tick();textarea.focus({preventScroll:true});textarea.setSelectionRange(from+text.length,from+text.length);
 }
 function list(kind:'bullet'|'ordered'|'task'){void insertBlock(selection=>selection.split('\n').map((line,index)=>(kind==='ordered'?`${index+1}. `:kind==='task'?'- [ ] ':'- ')+line).join('\n'));}
 function table(){void insertBlock(selection=>'| '+tr('見出し1','Heading 1')+' | '+tr('見出し2','Heading 2')+' |\n| --- | --- |\n| '+(selection.replace(/\|/g,'\\|').replace(/\r?\n/g,' ')||tr('内容','Content'))+' | '+tr('内容','Content')+' |\n');}
 async function choose(option:CodeLanguageOption){if(!textarea||!fence||disabled)return;const at=fence.to;close();replaceRange(option.id,at,at);await tick();textarea.focus({preventScroll:true});textarea.setSelectionRange(at+option.id.length,at+option.id.length);}
 function keys(event:KeyboardEvent){if(!expanded)return;if(event.key==='Escape'){event.preventDefault();close();textarea?.focus({preventScroll:true});}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selected=options.length?(selected+(event.key==='ArrowDown'?1:-1)+options.length)%options.length:0;const option=panel?.querySelector<HTMLButtonElement>(`[data-option="${selected}"]`);option?.scrollIntoView({block:'nearest'});option?.focus({preventScroll:true});}else if(event.key==='Enter'&&options[selected]){event.preventDefault();void choose(options[selected]);}}
 async function uploadImages(files:File[]){
  if(disabled||uploading||!imageContext||!imageAllowed||!textarea)return;close();imageError='';uploading=true;onUploadState?.(true);
  try{for(const file of files){
   if(file.size>10*1024*1024)throw Error(tr('画像は1件10MiBまでです。','Images must be at most 10MiB each.'));
   const insertion=textarea.selectionStart,form=new FormData();form.set('file',file);
   const query=new URLSearchParams(Object.entries(imageContext).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]));
   const response=await fetch('/v1/project-markdown-images?'+query,{method:'POST',body:form});const result=await response.json();
   if(!response.ok)throw Error(tr('画像を保存できませんでした。形式・容量・権限を確認してください。','Image upload failed. Check the format, limits and permissions.'));
   const key=result.data.key as string;drafts.add(key);
   if(destroyed){void cleanup(key);return;}
   const text='!['+file.name.replace(/[\[\]\\\r\n]/g,'')+'](sph-image:'+key+')';
   if(textarea.value.length+text.length>maxlength){void cleanup(key);drafts.delete(key);throw Error(tr('本文の文字数上限を超えます。','The text limit would be exceeded.'));}
   replaceRange(text,insertion,insertion);await tick();
  }}catch(error){if(!destroyed)imageError=error instanceof Error?error.message:tr('画像を保存できませんでした。','Image upload failed.');}
  finally{uploading=false;onUploadState?.(false);await tick();if(!destroyed)textarea?.focus({preventScroll:true});}
 }
 function pasteImage(event:ClipboardEvent){const files=[...(event.clipboardData?.files??[])].filter(file=>file.type.startsWith('image/'));if(files.length&&imageContext&&!disabled&&!uploading){event.preventDefault();void uploadImages(files);}}
 function dropImage(event:DragEvent){const files=[...(event.dataTransfer?.files??[])];if(files.length&&imageContext&&!disabled&&!uploading){event.preventDefault();void uploadImages(files);}}
</script>
<svelte:window onresize={position} onscroll={position}/>
<div class="markdown-editor" class:label-toolbar={labelToolbar} data-markdown-editor={field}>
 {#snippet tools()}
 <div class="editor-toolbar">
  <MarkdownToolButton kind="bold" label={tr('太字','Bold')} {disabled} onclick={()=>void insert('**','**')}/>
  <MarkdownToolButton kind="italic" label={tr('斜体','Italic')} {disabled} onclick={()=>void insert('*','*')}/>
  <MarkdownToolButton kind="strike" label={tr('見え消し（取り消し線）','Strikethrough')} {disabled} onclick={()=>void insert('~~','~~')}/>
  <MarkdownToolButton kind="link" label={tr('リンク','Link')} {disabled} onclick={()=>void insert('[','](https://)')}/>
  <MarkdownToolButton kind="code" label={tr('コードブロック','Code block')} {disabled} onclick={async()=>{await insert('\n```');if(textarea)void changed(textarea.value);}}/>
  <MarkdownToolButton kind="bullet-list" label={tr('箇条書き','Bulleted list')} {disabled} onclick={()=>list('bullet')}/>
  <MarkdownToolButton kind="ordered-list" label={tr('番号付きリスト','Numbered list')} {disabled} onclick={()=>list('ordered')}/>
  <MarkdownToolButton kind="task-list" label={tr('チェックリスト','Checklist')} {disabled} onclick={()=>list('task')}/>
  <MarkdownToolButton kind="table" label={tr('テーブル','Table')} {disabled} onclick={table}/>
  {#if imageContext&&imageAllowed}<MarkdownToolButton kind="image" label={uploading?tr('画像を保存中…','Uploading image…'):tr('画像','Image')} disabled={disabled||uploading} onclick={()=>imageInput?.click()}/><input bind:this={imageInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label={tr('画像を選択','Choose images')} disabled={disabled||uploading} onchange={event=>{void uploadImages([...(event.currentTarget.files??[])]);event.currentTarget.value='';}}/>{/if}
  <MarkdownToolButton kind="preview" label={preview?tr('プレビューを折りたたむ','Collapse preview'):tr('プレビューを表示','Show preview')} onclick={()=>preview=!preview} class="preview-toggle"/>
 </div>
 {/snippet}
 {#if !labelToolbar}{@render tools()}{/if}
 {#if imageError}<StatusNotice message={imageError} tone="error" onDismiss={()=>imageError=''}/>{/if}
 <div class="mobile-tabs" role="tablist" aria-label={tr('Markdownの編集とプレビュー','Markdown editing and preview')}>
  {#each ['edit','preview'] as tab}<button type="button" role="tab" aria-selected={mobileTab===tab} aria-controls={`${field}-${tab}-panel`} id={`${field}-${tab}-tab`} tabindex={mobileTab===tab?0:-1} onclick={()=>mobileTab=tab} onkeydown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();mobileTab=event.key==='Home'?'edit':event.key==='End'?'preview':mobileTab==='edit'?'preview':'edit';document.getElementById(`${field}-${mobileTab}-tab`)?.focus();}}}>{tab==='edit'?tr('編集','Edit'):tr('プレビュー','Preview')}</button>{/each}
 </div>
 <div class="editor-columns" class:collapsed={!preview}>
  <div id={`${field}-edit-panel`} class="input-panel" class:mobile-hidden={mobileTab!=='edit'}>
   {#if labelToolbar}{@render tools()}{/if}
   <FormTextarea {label} {field} {value} {placeholder} {maxlength} disabled={disabled||uploading} rows={10} bind:element={textarea} onValueChange={(next,event)=>void changed(next,event?.inputType)} onKeydown={keys} onPaste={pasteImage} onDrop={dropImage} onDragover={event=>{if(imageContext&&event.dataTransfer?.types.includes('Files'))event.preventDefault();}} onCompositionChange={v=>{composing=v;if(!v)void changed(value);}}/>
  </div>
  <section id={`${field}-preview-panel`} class="preview-panel" class:desktop-hidden={!preview} class:mobile-hidden={mobileTab!=='preview'} aria-label={tr('プレビュー','Preview')}>
   <span class="preview-label">{tr('プレビュー','Preview')}</span><div class="preview-body"><MarkdownBody source={value}/></div>
  </section>
 </div>
 <div bind:this={panel} popover="auto" ontoggle={event=>expanded=event.newState==='open'} class="language-popup" tabindex="-1" style:left={`${left}px`} style:top={`${top}px`} onkeydown={keys} role="dialog" aria-label={tr('コードの言語を選択','Choose code language')}>
  <div class="popup-search"><FormInput label={tr('言語を検索','Search languages')} field={`${field}-language-search`} value={search} onValueChange={v=>{search=v;selected=0;}}/><ActionButton label={tr('閉じる','Close')} onclick={()=>{close();textarea?.focus({preventScroll:true});}}/></div>
  <div class="language-options">{#each options as option,index}<button type="button" data-option={index} aria-current={selected===index?'true':undefined} class:selected={selected===index} onclick={()=>void choose(option)}>{option.name}<small>{option.id}</small></button>{:else}<p>{tr('該当する言語がありません。','No matching languages.')}</p>{/each}</div>
 </div>
</div>
<style>
 .label-toolbar .editor-columns{grid-template-rows:auto minmax(240px,1fr);row-gap:6px}.label-toolbar .input-panel,.label-toolbar .preview-panel{display:grid;grid-row:span 2;grid-template-rows:subgrid;gap:6px}.label-toolbar .input-panel :global(.form-textarea-field){grid-template-rows:minmax(240px,1fr)}.label-toolbar .input-panel :global(.form-textarea-field>span:first-child){position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.label-toolbar .preview-label{align-self:center}.label-toolbar .preview-panel.desktop-hidden{display:none}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.label-toolbar .input-panel.mobile-hidden,.label-toolbar .preview-panel.mobile-hidden{display:none}.label-toolbar .preview-panel:not(.mobile-hidden){display:grid}}
 .markdown-editor :global(textarea){font-family:ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace;font-variant-ligatures:none;tab-size:4}
 .input-panel{display:flex;flex-direction:column}.input-panel :global(.form-textarea-field){flex:1;grid-template-rows:auto minmax(240px,1fr)}.input-panel :global(textarea){height:100%;min-height:240px}
 .markdown-editor{display:grid;gap:8px;min-width:0;max-width:100%}.editor-toolbar{display:flex;flex-wrap:wrap;gap:6px}.editor-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0;align-items:stretch}.editor-columns.collapsed{grid-template-columns:minmax(0,1fr)}.input-panel,.preview-panel{min-width:0}.preview-panel{display:flex;flex-direction:column;gap:6px}.preview-label{font-size:var(--font-size-support);font-weight:500;color:var(--text)}.preview-body{flex:1;min-height:240px;max-height:440px;overflow:auto;border:1px solid var(--border);border-radius:var(--sph-radius-4px);padding:12px;background:var(--surface)}.desktop-hidden{display:none}.mobile-tabs{display:none}.language-popup{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:min(360px,calc(100vw - 16px));max-height:calc(100dvh - 16px);padding:12px;border:1px solid var(--border);border-radius:var(--sph-radius-8px);background:var(--surface);color:var(--text);box-shadow:var(--shadow)}.popup-search{display:flex;gap:8px;align-items:end}.popup-search>:global(:first-child){min-width:0;flex:1}.language-options{max-height:min(250px,35dvh);overflow:auto;margin-top:8px}.language-options button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px;border:0;border-radius:4px;padding:8px;background:transparent;color:var(--text);font-size:var(--font-size-body);text-align:left;cursor:pointer}.language-options button.selected,.language-options button:hover{background:var(--surface-hover)}.language-options small{font-size:var(--font-size-support);color:var(--muted)}button:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){.editor-columns{grid-template-columns:minmax(0,1fr)}.mobile-hidden{display:none}.preview-panel:not(.mobile-hidden){display:flex}.editor-toolbar :global(.preview-toggle){display:none}.mobile-tabs{display:flex;border-bottom:1px solid var(--border)}.mobile-tabs button{min-height:44px;border:0;border-bottom:2px solid transparent;padding:8px 16px;background:transparent;color:var(--muted);font-size:var(--font-size-body)}.mobile-tabs button[aria-selected=true]{border-color:var(--action-primary);color:var(--action-primary)}.preview-body{min-height:240px;max-height:50dvh}}
</style>
