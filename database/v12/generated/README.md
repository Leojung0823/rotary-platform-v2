# Generated database types

`database.types.ts` 只可由以下命令產生：

```bash
npm run db:v12:types
```

禁止人工修改。CI 使用 `npm run db:v12:types:check` 從獨立 V1.2 local stack 重新生成並比對 drift；輸出只包含 `public` schema。
