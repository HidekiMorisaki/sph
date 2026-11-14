// Original fictional content authored for the optional initial project dataset.
// Markdown is stored as source; code fences are documentation, never executed.
export function projectExampleMarkdown(definition, ja) {
 const t=(j,e)=>ja?j:e,code=definition.code;
 const topics={
  DEVELOP:{
   goal:t('社内ツールのログイン機能を改善し、設計からリリース判定までの作業を管理します。','Improve an internal tool’s login experience and track the work from design through release approval.'),
   artifact:t('入力チェックの実装','Input validation implementation'),
   language:'typescript',
   source:'type LoginInput = { email: string; password: string };\n\nfunction validateLogin(input: LoginInput): string[] {\n  const errors: string[] = [];\n  if (!input.email.trim()) errors.push("email_required");\n  if (!input.password) errors.push("password_required");\n  return errors;\n}',
   detail:t('未入力時のメッセージ、キーボード操作、エラー表示を確認します。','Review empty-field messages, keyboard operation and error presentation.'),
   verification:'const errors = validateLogin({ email: "", password: "" });\nconsole.assert(errors.includes("email_required"));\nconsole.assert(errors.includes("password_required"));',
   verificationLanguage:'typescript'
  },
  MIGRATION:{
   goal:t('環境移行の準備、試験移行、検証、完了判定を段階的に進めます。','Coordinate migration preparation, a trial run, verification and completion approval.'),
   artifact:t('移行前のテーブル確認','Pre-migration table inventory'),
   language:'sql',
   source:"SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'public'\n  AND table_type = 'BASE TABLE'\nORDER BY table_name;",
   detail:t('移行前後の件数、接続先、実行結果を記録し、差異の理由を確認します。','Record row counts, connection destinations and execution results before and after migration, and explain any differences.'),
   verification:"SELECT COUNT(*) AS active_projects\nFROM projects\nWHERE deleted_at IS NULL;\n\nSELECT COUNT(*) AS active_tickets\nFROM project_tickets\nWHERE deleted_at IS NULL;",
   verificationLanguage:'sql'
  },
  WEBSITE:{
   goal:t('Webサイトのトップページを改善し、モバイル表示とアクセシビリティを確認します。','Improve the website home page and review its mobile layout and accessibility.'),
   artifact:t('ページの基本構造','Page structure'),
   language:'html',
   source:t('<main>\n  <h1>社内ポータル</h1>\n  <p>必要な情報へすばやくアクセスできます。</p>\n  <a href="#updates">更新情報を見る</a>\n  <section id="updates" aria-labelledby="updates-title">\n    <h2 id="updates-title">更新情報</h2>\n    <p>今週の改善内容をお知らせします。</p>\n  </section>\n</main>','<main>\n  <h1>Staff portal</h1>\n  <p>Find the information you need.</p>\n  <a href="#updates">Read updates</a>\n  <section id="updates" aria-labelledby="updates-title">\n    <h2 id="updates-title">Updates</h2>\n    <p>Read about this week’s improvements.</p>\n  </section>\n</main>'),
   detail:t('見出しの順序、リンクの目的、狭い画面での折り返しを確認します。','Check heading order, link purpose and wrapping on narrow screens.'),
   verification:'.page-content {\n  width: min(100% - 2rem, 72rem);\n  margin-inline: auto;\n}\n\na:focus-visible {\n  outline: 2px solid currentColor;\n  outline-offset: 3px;\n}',
   verificationLanguage:'css'
  }
 };
 const topic=topics[code];
 if(!topic)throw Error('Unknown initial project content');
 const fence=(language,title,source)=>'```'+language+':'+title+'\n'+source+'\n```';
 const stages=t(['計画','実施','レビュー'],['Plan','Implement','Review']);
 const project=[
  '# '+definition.name,
  topic.goal,
  '## '+t('進め方','Approach'),
  '1. '+t('親チケットで目的と日程を確認する。','Review the objectives and dates in the parent ticket.')+'\n2. '+t('子チケットで作業を分担し、確認結果をコメントする。','Organize work into child tickets and record findings in comments.')+'\n3. '+t('依存する作業を終えてから、完了判定を行う。','Complete prerequisite work before the final review.'),
  '## '+t('確認する項目','Review points'),
  '| '+t('段階 | 確認内容','Stage | Review focus')+' |\n| --- | --- |\n| '+stages[0]+' | '+t('目的・担当・日程','Objectives, owners and dates')+' |\n| '+stages[1]+' | '+t('実施内容と検証結果','Work performed and verification results')+' |\n| '+stages[2]+' | '+t('完了条件と残課題','Acceptance criteria and remaining work')+' |',
  '## '+t('進行ルールの記述例','Progress rules'),
  fence('json',t('プロジェクトの進行ルール','Project progress rules'),JSON.stringify({project:code,stages,reviewRequired:true},null,2)),
  '> '+t('コードは作業手順を説明するための記述です。この画面から実行されることはありません。','Code illustrates the working procedure and is never executed by this screen.'),
  '**'+t('関連チケット','Related tickets')+'**: '+code+'-0001 / '+code+'-0003\n\n['+t('チケット一覧を開く','Open ticket list')+'](/projects/'+code+'/tickets)'
 ].join('\n\n');
 const tickets=definition.titles.map((title,index)=>{
  const ticketCode=code+'-'+String(index+1).padStart(4,'0');
  const artifact=index%3===0
   ? fence('json',t('作業記録の形式','Work record format'),JSON.stringify({ticket:ticketCode,subject:title,reviewRequired:true},null,2))
   : index%3===1
    ? fence(topic.language,topic.artifact,topic.source)
    : fence(topic.verificationLanguage,t('確認用コード','Verification code'),topic.verification);
  return [
   '## '+title,
   '**'+t('目的','Objective')+'**: '+topic.goal,
   '### '+t('作業内容','Work items'),
   '- '+t('このチケットの対象範囲を確認する。','Confirm the scope of this ticket.')+'\n- '+topic.detail+'\n- '+t('実施結果と残課題をコメントに記録する。','Record results and remaining work in a comment.'),
   '### '+t('実装・確認の記述例','Implementation and verification notes'),
   artifact,
   '### '+t('完了条件','Acceptance criteria'),
   '- [x] '+t('対象と目的を確認した','Scope and objective reviewed')+'\n- [ ] '+t('作業結果を記録した','Results recorded')+'\n- [ ] '+t('レビューで完了を確認した','Completion confirmed in review'),
   '> '+t('コードや設定値は説明用です。実際の対象に合わせて手順を確認してください。','Code and settings are illustrative. Review the procedure for the actual target.'),
   t('関連プロジェクト','Related project')+': '+code+'\n\n['+t('プロジェクト概要を開く','Open project overview')+'](/projects/'+code+'/overview)'
  ].join('\n\n');
 });
 const comment=[
  '### '+t('レビューの引き継ぎ','Review handoff'),
  t('**実装内容と日程**を確認しました。次の項目を確認し、結果を追記してください。','Reviewed the **implementation and dates**. Please check the following items and add your findings.'),
  '- '+topic.detail+'\n- '+t('関連チケットの完了状況を確認する。','Review the completion status of related tickets.'),
  fence(topic.verificationLanguage,t('レビュー時の確認内容','Review verification'),topic.verification),
  '| '+t('項目 | 記録する内容','Item | What to record')+' |\n| --- | --- |\n| '+t('結果 | 期待どおりの動作か','Result | Whether behavior matches expectations')+' |\n| '+t('残課題 | 担当者と次の対応','Remaining work | Owner and next action')+' |',
  '> '+t('確認できない点は、完了にする前に相談してください。','Discuss anything that cannot be verified before marking the work complete.'),
  t('関連','Related')+': '+code+'-0001 / '+code+'-0003'
 ].join('\n\n');
 return {project,tickets,comment};
}
