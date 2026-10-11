import { actionbar } from './messages/actionbar.ts';
import { common } from './messages/common.ts';
import { lobby } from './messages/lobby.ts';
import { panel } from './messages/panel.ts';
import { table } from './messages/table.ts';

/**
 * Every message table, by namespace. A full key is `<namespace>.<key>`,
 * e.g. `table.pot.label`. Add a namespace here only with a new messages file.
 */
export const catalog = { common, table, actionbar, panel, lobby };

export type Catalog = typeof catalog;
export type Namespace = keyof Catalog;

/** Every valid `t()` key, checked at compile time. */
export type MessageKey = {
  [N in Namespace]: `${N}.${Extract<keyof Catalog[N]['en'], string>}`;
}[Namespace];
