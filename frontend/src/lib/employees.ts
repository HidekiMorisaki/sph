export type EmployeeMaster = { id: number; code?: string; name: string };
export type EmployeeRole = { code: string; name: string };

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
	groupId: number | null;
	positionId: number | null;
	employmentTypeId: number;
	branchId: number;
	retiredAt: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	departmentRef?: EmployeeMaster | null;
	group?: EmployeeMaster | null;
	position?: EmployeeMaster | null;
	employmentType?: EmployeeMaster | null;
	branch?: EmployeeMaster | null;
	roles: EmployeeRole[];
	canIssueInvitation: boolean;
};

export const employeeFullName = (employee: Pick<EmployeeProfile, 'firstName' | 'middleName' | 'lastName'>) =>
	[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');
