// The queries on handovers: one row per submission handed over (migrations.ts says what it holds and what it never does).
import type { Selectable } from "kysely";
import type { Exec } from "./connection.ts";
import type { HandoversTable } from "./schema.ts";

export type HandoverRow = Selectable<HandoversTable>;
export type HandoverPatch = Partial<
  Pick<HandoverRow, "state" | "client_id" | "quote_id" | "quote_number" | "files_done" | "files_left" | "attempts" | "next_try" | "error">
>;

export function handoverQueries({ q, all, first, run }: Exec) {
  return {
    handover: (id: string): HandoverRow | undefined => first(q.selectFrom("handovers").selectAll().where("submission_id", "=", id)),
    /** A new pending row; false when the submission has one already (it is left as it is). */
    insertHandover: (id: string, form: string, at: string): boolean =>
      run(
        q
          .insertInto("handovers")
          .values({ submission_id: id, form, state: "pending", received_at: at, updated_at: at })
          .onConflict((oc) => oc.column("submission_id").doNothing()),
      ) === 1,
    updateHandover: (id: string, patch: HandoverPatch, at: string): void => {
      run(
        q
          .updateTable("handovers")
          .set({ ...patch, updated_at: at })
          .where("submission_id", "=", id),
      );
    },
    /** The failed handovers whose next try is due at `now`, oldest first. */
    dueHandovers: (now: string): string[] =>
      all(q.selectFrom("handovers").select("submission_id").where("state", "=", "failed").where("next_try", "<=", now).orderBy("next_try")).map(
        (r) => r.submission_id,
      ),
  };
}
