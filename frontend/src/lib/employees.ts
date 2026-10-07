export type EmployeeMaster = {
	id: number;
	name: string;
	notes?: string | null;
	sortOrder?: number;
	usageCount?: number;
	departmentId?: number | null;
	department?: { id: number; name: string } | null;
};
export type EmployeeRole = { id: number; name: string; isSystemManagement?: boolean };
export type SocialLinkPlatform = 'github' | 'linkedin' | 'x' | 'threads' | 'bluesky' | 'mastodon' | 'facebook' | 'instagram' | 'youtube' | 'qiita' | 'note';
export type EmployeeSocialLink = { platform: SocialLinkPlatform; url: string };

export const socialLinkPlatforms: Array<{ value: SocialLinkPlatform; label: string }> = [
	{ value: 'github', label: 'GitHub' },
	{ value: 'linkedin', label: 'LinkedIn' },
	{ value: 'x', label: 'X' },
	{ value: 'threads', label: 'Threads' },
	{ value: 'bluesky', label: 'Bluesky' },
	{ value: 'mastodon', label: 'Mastodon' },
	{ value: 'facebook', label: 'Facebook' },
	{ value: 'instagram', label: 'Instagram' },
	{ value: 'youtube', label: 'YouTube' },
	{ value: 'qiita', label: 'Qiita' },
	{ value: 'note', label: 'note' }
];

export const socialLinkLabel = (platform: SocialLinkPlatform) => socialLinkPlatforms.find((item) => item.value === platform)?.label ?? platform;

export type EmployeeProfile = {
	id: number;
	firstName: string;
	middleName: string | null;
	lastName: string;
	nameKana: string | null;
	birthDate: string;
	gender: string;
	bloodType: string | null;
	postalCode: string | null;
	prefecture: string | null;
	city: string | null;
	streetAddress: string | null;
	buildingName: string | null;
	mobilePhone: string | null;
	email: string;
};

export type Employee = EmployeeProfile & {
	employeeCode: string;
	age: number;
	lengthOfService: { years: number; months: number };
	hiredAt: string;
	departmentId: number | null;
	departmentIds: number[];
	primaryDepartmentId: number | null;
	groupId: number | null;
	positionId: number | null;
	positionIds: number[];
	primaryPositionId: number | null;
	employmentTypeId: number;
	branchId: number;
	retiredAt: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	employmentStatus: 'current' | 'retired' | 'deleted';
	departmentRef?: EmployeeMaster | null;
	departments: Array<EmployeeMaster & { isPrimary: boolean }>;
	departmentNames: string;
	group?: EmployeeMaster | null;
	position?: EmployeeMaster | null;
	positions: Array<EmployeeMaster & { isPrimary: boolean }>;
	positionNames: string;
	employmentType?: EmployeeMaster | null;
	branch?: EmployeeMaster | null;
	roles: EmployeeRole[];
	socialLinks: EmployeeSocialLink[];
	canIssueInvitation: boolean;
};
