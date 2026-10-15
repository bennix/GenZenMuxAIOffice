/** A source or explicitly selected face cannot cover translated text. */
export class MissingPdfFontError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingPdfFontError'
  }
}
