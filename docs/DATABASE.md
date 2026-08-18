# Database

The workbench uses PostgreSQL through Prisma when `DATABASE_URL` is set. Without it, the current stateless workflow keeps working.

## What the first release stores

- Organizations, users, and the initial roles: `ADMIN`, `OPERATOR`, `DESIGNER`, `VIEWER`
- Product workspaces and immutable input versions
- Reference assets and their roles
- Strategy runs, image plans, and image plan versions
- Generation runs, generated image assets, request snapshots, costs, and audit events

`strategyContent` and `promptEn` are stored together for every plan version. A generation run records the exact plan version, English execution draft, execution context, and reference asset IDs used at that time.

反馈和重生相关表已预留。当前图片反馈聊天仍保持页面内会话，不会跨页面保存。

## Enable PostgreSQL

1. 在根目录 `.env` 设置 `POSTGRES_PASSWORD`。本地直接运行后端时，在 `backend/.env` 设置 `DATABASE_URL`。
2. Start PostgreSQL with the optional compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.db.yml up -d
```

3. Apply the committed migration:

```bash
cd backend
npm run db:migrate:deploy
```

Do not run `db:migrate:dev` on the production server.

## Login and roles

认证在 PostgreSQL 启用时默认开启。把这些值放在 `backend/.env`，不要提交到 Git：

```env
AUTH_ENABLED=true
AUTH_SESSION_DAYS=14
BOOTSTRAP_ADMIN_LOGIN=admin
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password
BOOTSTRAP_ADMIN_NAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=
```

后端启动时会创建初始管理员。该账号已存在时不会重设密码或重复创建。

- `ADMIN`：成员管理和全部工作台操作
- `OPERATOR`：上传、策略、生图、聊天和下载
- `DESIGNER`：全部工作台操作
- `VIEWER`：查看和下载

每次策略、生图都会记录执行者。策略版本和图片生成记录会保留当时使用的输入、英文执行稿、执行上下文和参考图资产 ID。

## Selection-system integration

The selection system must keep its own business tables. It should pass `sourceSystem` and `externalProductId` to this workbench. The workbench creates its own input snapshot so older strategies and images remain reproducible after product data changes.
