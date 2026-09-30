import assert from 'node:assert/strict';
import { formatPersonName, inferPersonNameLocale, inferPersonNameOrder } from '../src/lib/person-name.ts';

const englishFallback = 'givenFirst';
const japaneseFallback = 'surnameFirst';

assert.equal(formatPersonName({ firstName: 'Hana', middleName: 'Marie', lastName: 'Yamada' }, englishFallback), 'Hana Marie Yamada');
assert.equal(formatPersonName({ firstName: '花子', middleName: null, lastName: '山田' }, englishFallback), '山田 花子');
assert.equal(formatPersonName({ firstName: '花子', middleName: '美咲', lastName: '山田' }, englishFallback), '山田 美咲 花子');
assert.equal(formatPersonName({ firstName: 'はなこ', middleName: null, lastName: 'やまだ' }, englishFallback), 'やまだ はなこ');
assert.equal(formatPersonName({ firstName: 'ハナコ', middleName: null, lastName: 'ヤマダ' }, englishFallback), 'ヤマダ ハナコ');
assert.equal(formatPersonName({ firstName: '민수', middleName: null, lastName: '김' }, englishFallback), '김 민수');
assert.equal(formatPersonName({ firstName: 'Hana', middleName: null, lastName: 'Yamada' }, japaneseFallback), 'Hana Yamada');
assert.equal(inferPersonNameLocale({ firstName: '花子', lastName: '・山田' }), 'zh');
assert.equal(inferPersonNameOrder({ firstName: '花子', lastName: 'Yamada' }, japaneseFallback), 'givenFirst');
assert.equal(inferPersonNameOrder({ firstName: '123', lastName: '456' }, japaneseFallback), 'surnameFirst');

console.log(JSON.stringify({ verified: true, cldrScriptMatching: true, cases: 10 }));
