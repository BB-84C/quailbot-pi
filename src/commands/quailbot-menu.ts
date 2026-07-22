import { DynamicBorder, getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, SettingsList, Spacer, Text, type SelectItem, type SettingItem } from "@earendil-works/pi-tui";

const SUBMENU_SELECT_LIST_LAYOUT = {
  minPrimaryColumnWidth: 12,
  maxPrimaryColumnWidth: 32,
};

export type QuailbotMenuItem = SettingItem;

type PostMenuAction = () => void | Promise<void>;

/**
 * Close-hook for the currently open Quailbot settings menu. Quailbot menus are modal and
 * never nested, so a single module-level slot is sufficient.
 */
let activeMenuClose: ((action: PostMenuAction) => void) | undefined;

/**
 * Close the currently open Quailbot settings menu (if any), then run `action` after the
 * menu's `ctx.ui.custom` promise has resolved.
 *
 * Reload safety: Pi's interactive input loop re-arms user input only after the whole
 * slash-command handler returns, and `ctx.reload()` tears down pending extension UI
 * components WITHOUT resolving their promises. Triggering a reload while a Quailbot menu
 * is still open therefore orphans the menu promise, the command handler never returns,
 * and every subsequent non-builtin submission is silently dropped. Any menu action that
 * may directly or indirectly call `ctx.reload()` MUST be routed through this function.
 */
export function closeQuailbotMenuThenRun(action: PostMenuAction): void {
  const close = activeMenuClose;
  if (close !== undefined) {
    close(action);
    return;
  }
  void action();
}

export async function openQuailbotSettingsMenu(
  ctx: ExtensionCommandContext,
  items: QuailbotMenuItem[],
  onChange: (id: string, newValue: string) => void = () => undefined,
): Promise<void> {
  let postMenuAction: PostMenuAction | undefined;
  try {
    await ctx.ui.custom<void>(
      (_tui, _theme, _keybindings, done) => {
        activeMenuClose = (action) => {
          postMenuAction = action;
          done();
        };
        return new QuailbotSettingsMenu(
          items,
          onChange,
          () => done(),
        );
      },
      { overlay: true },
    );
  } catch (error) {
    ctx.ui.notify(`Could not open Quailbot menu: ${errorMessage(error)}`, "warning");
  } finally {
    activeMenuClose = undefined;
  }

  if (postMenuAction !== undefined) {
    await postMenuAction();
  }
}

export function selectSubmenu(
  title: string,
  description: string | undefined,
  options: SelectItem[],
  currentValue: string,
  onSelect: (value: string) => void,
): SettingItem["submenu"] {
  return (_currentValue, done) =>
    new QuailbotSelectSubmenu(
      title,
      description,
      options,
      currentValue,
      (value) => {
        onSelect(value);
        done(value);
      },
      () => done(),
    );
}

class QuailbotSettingsMenu extends Container {
  private readonly settingsList: SettingsList;

  constructor(items: SettingItem[], onChange: (id: string, newValue: string) => void, onCancel: () => void) {
    super();
    this.addChild(new DynamicBorder());
    this.addChild(new Text("Quailbot", 0, 0));
    this.addChild(new Spacer(1));
    this.settingsList = new SettingsList(items, Math.min(Math.max(items.length, 1), 10), getSettingsListTheme(), onChange, onCancel, {
      enableSearch: true,
    });
    this.addChild(this.settingsList);
    this.addChild(new DynamicBorder());
  }

  handleInput(data: string): void {
    this.settingsList.handleInput(data);
  }
}

class QuailbotSelectSubmenu extends Container {
  private readonly selectList: SelectList;

  constructor(
    title: string,
    description: string | undefined,
    options: SelectItem[],
    currentValue: string,
    onSelect: (value: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.addChild(new DynamicBorder());
    this.addChild(new Text(title, 0, 0));
    if (description !== undefined && description.length > 0) {
      this.addChild(new Spacer(1));
      this.addChild(new Text(description, 0, 0));
    }
    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, Math.min(options.length, 10), getSelectListTheme(), SUBMENU_SELECT_LIST_LAYOUT);
    const currentIndex = options.findIndex((option) => option.value === currentValue);
    if (currentIndex >= 0) {
      this.selectList.setSelectedIndex(currentIndex);
    }
    this.selectList.onSelect = (item) => onSelect(item.value);
    this.selectList.onCancel = onCancel;
    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text("  Enter to select · Esc to go back", 0, 0));
    this.addChild(new DynamicBorder());
  }

  handleInput(data: string): void {
    this.selectList.handleInput(data);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
