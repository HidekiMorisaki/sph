-- Match the Prisma relation's ON UPDATE action without changing history rows.
ALTER TABLE public.master_change_history
    DROP CONSTRAINT master_change_history_actor_id_fkey,
    ADD CONSTRAINT master_change_history_actor_id_fkey
        FOREIGN KEY (actor_id) REFERENCES public.employees(id)
        ON UPDATE CASCADE ON DELETE RESTRICT;
