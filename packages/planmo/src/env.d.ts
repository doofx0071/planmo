/**
 * Ambient augmentation for `import.meta.url`.
 *
 * The TypeScript 7 native compiler does not currently surface the
 * @types/node ImportMeta augmentation for `url` in NodeNext modules
 * (see risk R-019). This declaration restores it; remove once TS7
 * resolves the augmentation natively.
 */
interface ImportMeta {
  url: string;
}
