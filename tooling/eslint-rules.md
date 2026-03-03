# ESLint 配置备忘（项目初始化时落实）

以下规则在初始化项目时配置到 `eslint.config.js`，配好后自动执行，无需文档重复说明。

## 必须启用的规则

```js
// eslint.config.js 关键规则（项目初始化时配置）
export default [
  {
    rules: {
      // 禁止 any
      '@typescript-eslint/no-explicit-any': 'error',

      // 禁止 console.log
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // 禁止 default export
      'import/no-default-export': 'error',

      // Import 排序（auto-fixable）
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
        'newlines-between': 'always',
      }],

      // 函数最大 50 行
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],

      // 最大嵌套 3 层
      'max-depth': ['error', 3],

      // 参数最多 3 个
      'max-params': ['warn', 3],

      // 禁止嵌套三元
      'no-nested-ternary': 'error',

      // 禁止非 null 断言
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // 禁止空 catch
      'no-empty': ['error', { allowEmptyCatch: false }],

      // 命名规范
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
      ],
    },
  },

  // game-engine 特殊规则（更严格）
  {
    files: ['packages/game-engine/**/*.ts'],
    rules: {
      // 禁止非确定性 API（引擎必须可重放）
      'no-restricted-globals': ['error', 'Date'],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: '使用注入的 rng 参数' },
      ],
    },
  },
];
```

## CI 检查

```yaml
# .github/workflows/ci.yml 中添加
- name: Lint
  run: pnpm lint

- name: Type Check
  run: pnpm typecheck

- name: Circular Dependency Check
  run: npx madge --circular --extensions ts packages/ apps/

- name: Test
  run: pnpm test --coverage
```

## 其他工具

- `commitlint` + `husky`: pre-commit 校验 commit message 格式
- `prettier`: 代码格式化（保存时自动执行）
- `madge`: 循环依赖检测（CI 阻断）
- `knip`: 检测未使用的导出和依赖
