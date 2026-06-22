import { DynamicBorder, getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, SettingsList, Spacer, Text, type SelectItem, type SettingItem } from "@earendil-works/pi-tui";

const SUBMENU_SELECT_LIST_LAYOUT = {
  minPrimaryColumnWidth: 12,
  maxPrimaryColumnWidth: 32,
};

export type QuailbotMenuItem = SettingItem;

export async function openQuailbotSettingsMenu(
  ctx: ExtensionCommandContext,
  items: QuailbotMenuItem[],
  onChange: (id: string, newValue: string) => void = () => undefined,
): Promise<void> {
  try {
    await ctx.ui.custom<void>(
      (_tui, _theme, _keybindings, done) =>
        new QuailbotSettingsMenu(
          items,
          onChange,
          () => done(),
        ),
      { overlay: true },
    );
  } catch (error) {
    ctx.ui.notify(`Could not open Quailbot menu: ${errorMessage(error)}`, "warning");
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
