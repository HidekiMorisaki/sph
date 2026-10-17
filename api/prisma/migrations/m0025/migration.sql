-- Align installation foreign keys with the current Prisma schema.
ALTER TABLE "software_installations" DROP CONSTRAINT "software_installations_contract_id_fkey";
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "software_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "software_installations" DROP CONSTRAINT "software_installations_asset_id_fkey";
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "it_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "software_installation_users" DROP CONSTRAINT "software_installation_users_installation_id_fkey";
ALTER TABLE "software_installation_users" ADD CONSTRAINT "software_installation_users_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "software_installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "software_installation_users" DROP CONSTRAINT "software_installation_users_employee_id_fkey";
ALTER TABLE "software_installation_users" ADD CONSTRAINT "software_installation_users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
