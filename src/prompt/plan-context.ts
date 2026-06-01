export class PlanContextStore {
  private text = "";

  set(text: string): void {
    this.text = text;
  }

  append(text: string): void {
    if (this.text.length === 0) {
      this.text = text;
      return;
    }

    this.text = `${this.text}\n${text}`;
  }

  clear(): void {
    this.text = "";
  }

  get(): string {
    return this.text;
  }

  render(): string | undefined {
    const text = this.text.trim();
    return text.length > 0 ? `QUAILBOT PLAN CONTEXT\n${text}` : undefined;
  }
}
