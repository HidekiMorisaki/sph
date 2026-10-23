export type CodeLanguage = 'json' | 'html' | 'css' | 'javascript';
export type CodeToken = { text: string; kind: string };

// Small lexical highlighter. Tokens are rendered as escaped text, never HTML.
// Incomplete strings/comments stay editable and no source is evaluated.
export function highlightCode(source: string, language: CodeLanguage): CodeToken[] {
	const patterns: Record<CodeLanguage, RegExp> = {
		json: /"(?:\\[\s\S]|[^"\\])*"?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g,
		html: /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[\w:-]+|\/?>|\s[\w:-]+(?=\s*=)|"[^"]*"|'[^']*'|&[\w#]+;/g,
		css: /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|[\w-]+(?=\s*:)|#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|s|ms|%)?|@[\w-]+|[{}:;,()]/g,
		javascript: /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|`(?:\\[\s\S]|[^`\\])*`?|\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|yield|true|false|null|undefined)\b|\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)\b|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}\[\]();,.=+*/<>!?:&|%-]/g
	};
	const tokens: CodeToken[] = [];
	let end = 0;
	for (const match of source.matchAll(patterns[language])) {
		if (match.index > end) tokens.push({ text: source.slice(end, match.index), kind: 'plain' });
		const text = match[0];
		let kind = 'punctuation';
		if (text.startsWith('/*') || text.startsWith('//') || text.startsWith('<!--')) kind = 'comment';
		else if (/^["'`]/.test(text)) kind = language === 'json' && source.slice(match.index + text.length).trimStart().startsWith(':') ? 'key' : 'string';
		else if (language === 'html') kind = text.startsWith('<') || text.endsWith('>') ? 'tag' : 'key';
		else if (/^-?\d|^#[\da-f]/i.test(text)) kind = 'number';
		else if (language === 'css' && /^[\w@-]/.test(text)) kind = 'key';
		else if (/^[A-Za-z_$]/.test(text)) kind = /^(true|false|null|undefined)$/.test(text) ? 'literal' : language === 'javascript' && source.slice(match.index + text.length).trimStart().startsWith('(') && !/^(if|for|while|switch|catch)$/.test(text) ? 'function' : 'keyword';
		tokens.push({ text, kind });
		end = match.index + text.length;
	}
	if (end < source.length) tokens.push({ text: source.slice(end), kind: 'plain' });
	return tokens;
}
