import type { SearchContext, SearchTarget } from './search';
import { employeeSearchFields } from './employee-search-fields';
import type { SearchInputField } from './search-field-inputs';

export type SearchSection = { code: string; fields: SearchInputField[]; contexts?: SearchContext[] };
export type SearchFieldsConfiguration = {
	rootContext: string;
	initialSection: string;
	sections: (contexts: SearchContext[]) => SearchSection[];
	widths?: Record<string, string>;
};
export type SearchConfiguration = {
	fieldsEndpoint: string;
	keywordExample: string;
	filterNameExample: string;
	fields: SearchFieldsConfiguration;
};

// Page-specific definitions only. SearchPanel and SearchFields own the shared
// interaction, rendering, persistence and condition conversion. API definitions
// remain the authority for which fields and related contexts are available.
export const searchConfigurations: Record<SearchTarget, SearchConfiguration> = {
	employees: {
		fieldsEndpoint: '/v1/employee-search-fields', keywordExample: 'keyword', filterNameExample: 'filterName',
		fields: {
			rootContext: 'employee', initialSection: 'basic',
			sections(contexts) {
				const fields = employeeSearchFields(contexts).filter(item => item.context !== 'account');
				return [
					{ code: 'basic', keys: ['employeeCode', 'lastName', 'firstName', 'middleName', 'nameKana', 'birthDate', 'gender', 'bloodType', 'age'] },
					{ code: 'contact', keys: ['countryCode', 'postalCode', 'prefecture', 'city', 'streetAddress', 'buildingName', 'mobilePhone', 'email'] },
					{ code: 'organization', keys: ['hiredAt', 'retiredAt', 'employmentStatus', 'serviceMonths', 'selection', 'notes'] },
					{ code: 'management', keys: ['createdAt', 'updatedAt'] },
					{ code: 'quick', keys: [] }
				].map(section => ({ code: section.code, fields: section.keys.flatMap(key => fields.filter(item => item.field.code === key)) }));
			},
			widths: { employeeCode: '160px', lastName: '144px', firstName: '144px', middleName: '176px', nameKana: '208px', gender: '112px', bloodType: '112px', age: '224px', countryCode: '144px', postalCode: '128px', prefecture: '160px', city: '176px', streetAddress: '256px', buildingName: '240px', mobilePhone: '176px', email: '272px', employmentStatus: '176px', serviceMonths: '144px', notes: '320px' }
		}
	},
	assets: {
        fieldsEndpoint: '/v1/it-asset-search-fields', keywordExample: 'assetKeyword', filterNameExample: 'assetFilterName',
        fields: {
            rootContext: 'asset', initialSection: 'basic',
            sections(contexts) {
                const fields = (contexts.find(context => context.code === 'asset')?.fields ?? []).map(field => ({ context: 'asset', field, root: true, exampleCode: field.code === 'notes' ? 'assetNotes' : field.code }));
                return [
                    { code: 'basic', fields: fields.filter(item => ['assetTag','modelNumber','serialNumber','status','purchasedOn','disposalOn','notes'].includes(item.field.code)) },
                    { code: 'hardware', fields: fields.filter(item => ['manufacturer','cpu','operatingSystem','ramGb'].includes(item.field.code)) },
                    { code: 'placement', fields: fields.filter(item => ['room','storage','assigneeName','assigneeCode','assignedAt'].includes(item.field.code)) },
                    { code: 'network', fields: fields.filter(item => item.field.code === 'hostname'), contexts: contexts.filter(context => context.code === 'ipAddresses') },
                    { code: 'management', fields: fields.filter(item => ['createdAt','updatedAt'].includes(item.field.code)) },
                    { code: 'quick', fields: [] }
                ];
            },
            widths: { assetTag: '176px', modelNumber: '224px', serialNumber: '224px', notes: '320px', hostname: '240px', assigneeName: '224px', assigneeCode: '176px', ramGb: '128px' }
        }
    },
	books: {
		fieldsEndpoint: '/v1/book-search-fields', keywordExample: 'bookKeyword', filterNameExample: 'bookFilterName',
		fields: {
			rootContext: 'title', initialSection: 'bibliography',
			sections(contexts) {
				const fields = (contexts.find(context => context.code === 'title')?.fields ?? []).map(field => ({ context: 'title', field, root: true, exampleCode: field.code === 'notes' ? 'bookNotes' : field.code }));
				const management = ['createdAt', 'updatedAt', 'sourceRetrievedAt'];
				return [
					{ code: 'bibliography', fields: fields.filter(item => !management.includes(item.field.code)) },
					...['inventory', 'circulation', 'purchases'].map(code => ({ code, fields: [], contexts: contexts.filter(context => context.related && context.category === code) })),
					{ code: 'management', fields: fields.filter(item => management.includes(item.field.code)) },
					{ code: 'quick', fields: [] }
				];
			},
			widths: { name: '320px', author: '256px', publisher: '240px', edition: '144px', isbn: '176px', notes: '320px', sourceUrl: '320px', coverSourceUrl: '320px', hasCover: '144px', rentable: '208px', copyCount: '192px' }
		}
	}
};
