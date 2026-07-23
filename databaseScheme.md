-- Tenant (công ty/team)
tenants
├── id            uuid PK
├── name           text
├── slug           text unique
├── created_at    timestamptz
└── owner_id       uuid FK → auth.users.id

-- Thành viên trong tenant + role
tenant_members
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── user_id        uuid FK → auth.users.id
├── role           text  ('owner' | 'member')
├── joined_at      timestamptz
└── UNIQUE (tenant_id, user_id)

-- Invite link có token
invites
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── token          text unique
├── created_by     uuid FK → auth.users.id
└── expires_at     timestamptz

-- Workspace (nhóm board theo phòng ban)
workspaces
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── name           text
└── created_at     timestamptz

-- Board
boards
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── workspace_id   uuid FK → workspaces.id
├── name           text
├── visibility     text  ('public' | 'restricted')  default 'public'
├── created_by     uuid FK → auth.users.id
└── created_at     timestamptz

board_members
├── board_id       uuid FK → boards.id
├── user_id        uuid FK → auth.users.id
└── PRIMARY KEY (board_id, user_id)

-- List (cột trong board)
lists
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── board_id       uuid FK → boards.id
├── name           text
├── position       float   -- dùng float để dễ chèn giữa 2 vị trí
└── created_at     timestamptz

-- Card
cards
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── list_id        uuid FK → lists.id
├── title          text
├── description    text nullable
├── assignee_id    uuid FK → auth.users.id, nullable
├── due_date       date nullable
├── position       float
├── created_by     uuid FK → auth.users.id
├── created_at     timestamptz
└── updated_at     timestamptz

-- Activity log (dạng feed đơn giản)
activity_logs
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── board_id       uuid FK → boards.id
├── user_id        uuid FK → auth.users.id
├── action_text    text     -- vd: "Nam đã chuyển card 'Fix bug' sang Doing"
└── created_at     timestamptz

-- Label màu cho card
labels
├── id             uuid PK
├── tenant_id      uuid FK → tenants.id
├── board_id       uuid FK → boards.id
├── name           text
└── color          text   -- hex code

card_labels
├── card_id        uuid FK → cards.id
└── label_id       uuid FK → labels.id

-- Checklist trong card
checklist_items
├── id             uuid PK
├── card_id        uuid FK → cards.id
├── content        text
├── is_done        boolean default false
└── position       float

-- Bình luận trong card
comments
├── id             uuid PK
├── card_id        uuid FK → cards.id
├── user_id        uuid FK → auth.users.id
├── content         text
└── created_at     timestamptz