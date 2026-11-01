import type { SearchField } from './search';

const examples: Record<string, [string, string]> = {
 projectsKeyword:['社内ポータル改善','Portal improvement'],projectsFilterName:['進行中のプロジェクト','Active projects'],projectsName:['社内ポータル改善','Portal improvement'],
 teamsKeyword:['開発','Engineering'],teamsFilterName:['開発チーム','Engineering teams'],teamsName:['開発チーム','Engineering'],
 skillsKeyword:['TypeScript','TypeScript'],skillsFilterName:['開発スキル','Development skills'],skillsName:['TypeScript','TypeScript'],
 clientsKeyword:['サンプル商事','Example Corporation'],clientsFilterName:['東京の取引先','Tokyo clients'],clientsName:['サンプル商事','Example Corporation'],
 engagementsKeyword:['システム開発','System development'],engagementsFilterName:['契約中の案件','Active contracts'],engagementsName:['システム開発','System development'],
 description:['システム開発','System development'],category:['プログラミング','Programming'],companyName:['サンプル株式会社','Example Corporation'],clientName:['サンプル商事','Example Corporation'],contactName:['山田太郎','Alex Smith'],contactDepartment:['営業部','Sales'],contactEmail:['taro@example.com','alex@example.com'],contactMobile:['090-1234-5678','090-1234-5678'],phoneNumber1:['03-1234-5678','03-1234-5678'],phoneNumber2:['03-1234-5679','03-1234-5679'],faxNumber1:['03-1234-5680','03-1234-5680'],faxNumber2:['03-1234-5681','03-1234-5681'],
 workflowKeyword:['週報 山田','Weekly report'],workflowFilterName:['自分の承認待ち','Awaiting my approval'],title:['週報','Weekly report'],templateName:['精算書','Expense report'],applicantName:['山田','Smith'],
	assetNotes: ['予備機', 'Spare device'],
	assetKeyword:['ラップトップ','Laptop'],assetFilterName:['未割当のラップトップ','Unassigned laptops'],assetTag:['PC-001','PC-001'],modelNumber:['ThinkPad','ThinkPad'],serialNumber:['SN001','SN001'],hostname:['office-pc','office-pc'],assigneeName:['山田','Smith'],assigneeCode:['EMP001','EMP001'],
	employeeCode: ['EMP001', 'EMP001'], lastName: ['山田', 'Smith'], firstName: ['太郎', 'Alex'],
	middleName: ['マイケル', 'James'], nameKana: ['ヤマダ タロウ', 'Yamada Taro'],
	postalCode: ['100-0001', '100-0001'], prefecture: ['東京都', 'Tokyo'], city: ['千代田区', 'Chiyoda'],
	streetAddress: ['丸の内1-2-3', '1-2-3 Marunouchi'], buildingName: ['サンプルビル101', 'Sample Building 101'],
	mobilePhone: ['090-1234-5678', '090-1234-5678'], email: ['taro@example.com', 'alex@example.com'],
	notes: ['営業担当', 'Sales representative'], username: ['taro.yamada', 'alex.smith'],
	keyword: ['山田', 'Smith'], filterName: ['東京拠点の従業員', 'Tokyo employees'],
	bookKeyword: ['TypeScript', 'TypeScript'], bookFilterName: ['貸出可能な書籍', 'Available books'], bookNotes: ['プログラミング入門', 'Programming reference'],
	name: ['TypeScript入門', 'Learning TypeScript'], author: ['山田太郎', 'Alex Smith'], publisher: ['サンプル出版', 'Example Press'],
	edition: ['第2版', '2nd edition'], isbn: ['9784798173460', '9784798173460'], catalogCode: ['BOOK001', 'BOOK001'],
	sourceProvider: ['openbd', 'openbd'], sourceUrl: ['https://example.com/books', 'https://example.com/books'],
	coverSource: ['manual', 'manual'], coverSourceUrl: ['https://example.com/cover.png', 'https://example.com/cover.png']
};

export function searchInputExample(field: Pick<SearchField, 'code' | 'type'>, language: 'ja' | 'en', part?: number): string {
	const example = field.type === 'number'
		? String(field.code === 'age' ? part === 1 ? 60 : 20 : part === 1 ? 30 : 12)
		: examples[field.code]?.[language === 'ja' ? 0 : 1] ?? 'ABC123';
	return `${language === 'ja' ? field.type === 'number' ? '例:' : '例: ' : 'e.g. '}${example}`;
}
