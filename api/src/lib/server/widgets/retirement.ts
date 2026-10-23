const retiredCodes=['sph.account','sph.book_notices','sph.book_loans','sph.today'];
export const retiredOfficialRelease={widgetCode:{in:retiredCodes},source:{sourceKey:'sph-official'}};
export const isRetiredOfficial=(code:string,sourceKey:string)=>sourceKey==='sph-official'&&retiredCodes.includes(code);
