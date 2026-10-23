export type Unit={id:string;ja:string;en:string;factor:number;offset?:number};
const u=(id:string,ja:string,en:string,factor:number,offset=0):Unit=>({id,ja,en,factor,offset});
export const unitCategories=[
 {id:'length',ja:'長さ',en:'Length',units:[u('m','メートル','Metres',1),u('km','キロメートル','Kilometres',1000),u('cm','センチメートル','Centimetres',.01),u('mm','ミリメートル','Millimetres',.001),u('in','インチ','Inches',.0254),u('ft','フィート','Feet',.3048),u('yd','ヤード','Yards',.9144),u('mi','マイル','Miles',1609.344)]},
 {id:'area',ja:'面積',en:'Area',units:[u('m²','平方メートル','Square metres',1),u('km²','平方キロメートル','Square kilometres',1e6),u('ha','ヘクタール','Hectares',10000),u('ft²','平方フィート','Square feet',.09290304),u('acre','エーカー','Acres',4046.8564224)]},
 {id:'mass',ja:'重さ',en:'Mass',units:[u('kg','キログラム','Kilograms',1),u('g','グラム','Grams',.001),u('mg','ミリグラム','Milligrams',.000001),u('t','トン','Tonnes',1000),u('lb','ポンド','Pounds',.45359237),u('oz','オンス','Ounces',.028349523125)]},
 {id:'volume',ja:'体積',en:'Volume',units:[u('L','リットル','Litres',1),u('mL','ミリリットル','Millilitres',.001),u('m³','立方メートル','Cubic metres',1000),u('US gal','米液量ガロン','US liquid gallons',3.785411784),u('imp gal','英ガロン','Imperial gallons',4.54609)]},
 {id:'temperature',ja:'温度',en:'Temperature',units:[u('°C','摂氏','Celsius',1,273.15),u('°F','華氏','Fahrenheit',5/9,273.15-32*5/9),u('K','ケルビン','Kelvin',1)]},
 {id:'time',ja:'時間',en:'Time',units:[u('s','秒','Seconds',1),u('ms','ミリ秒','Milliseconds',.001),u('min','分','Minutes',60),u('h','時間','Hours',3600),u('d','日（24時間）','Days (24 hours)',86400)]},
 {id:'data',ja:'データ容量',en:'Data size',units:[u('B','バイト','Bytes',1),u('bit','ビット','Bits',1/8),u('kB','キロバイト（1000）','Kilobytes (1000)',1000),u('MB','メガバイト','Megabytes',1e6),u('GB','ギガバイト','Gigabytes',1e9),u('TB','テラバイト','Terabytes',1e12),u('KiB','キビバイト（1024）','Kibibytes (1024)',1024),u('MiB','メビバイト','Mebibytes',1024**2),u('GiB','ギビバイト','Gibibytes',1024**3),u('TiB','テビバイト','Tebibytes',1024**4)]}
];
export function convertUnit(input:string,category:string,from:string,to:string):number|null{
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim()))return null;
 const value=Number(input),group=unitCategories.find(c=>c.id===category),a=group?.units.find(u=>u.id===from),b=group?.units.find(u=>u.id===to);
 if(!Number.isFinite(value)||!a||!b)return null;
 const base=value*a.factor+(a.offset??0);
 if(category==='temperature'&&base< -1e-10)return null;
 const result=(base-(b.offset??0))/b.factor;
 return Number.isFinite(result)?(Object.is(result,-0)?0:result):null;
}
