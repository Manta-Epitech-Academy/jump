# Changelog

All notable changes to this project will be documented in this file.

### 2026-04-08

- Migrate backend from PocketBase to Prisma + PostgreSQL + BetterAuth ([#2](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/2))
- Remove PocketBase residuals and migrate to proper Prisma types ([#3](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/3))
- Implement Salesforce external service ([#4](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/4))

---

### 2026-04-09

- Remove old SF Tools (deprecated) ([#6](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/6))
- Implementing discord account linking ([#5](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/5))

---

### 2026-04-10

- Chore/test infrastructure ([#1](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/1))

---

### 2026-04-11

- **added:** feat(rgpd): add auto-anonymization for inactive students ([#8](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/8))
- **changed:** refactor: betterauth-tables ([#9](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/9))

---

### 2026-04-13

- **fixed:** fix(seed.ts): update user and account tables to use bauth_ prefix ([#11](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/11))
- **added:** feat(k3s): add automatic rollout restart for K3s deployments (TESTING) ([#12](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/12))
- **fixed:** fix(k3s): update deployment name in rollout restart for K3s ([#13](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/13))
- **fixed:** fix(k3s): remove rollout status check from K3s deployment restart ([#14](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/14))

---

### 2026-04-14

- **added:** feat: event hierarchy refactor — Event → Planning → TimeSlot → Activity ([#16](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/16))
- Implement routes for the worker ([#17](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/17))
- Rename TekCamp to Jump and remove base path ([#18](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/18))

---

### 2026-04-15

- Detaching the Campus from the Talent ([#20](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/20))
- **added:** feat: per-campus timezone support ([#21](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/21))
- Fixing woker sync issues ([#22](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/22))
- Add staff role management ([#23](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/23))
- **changed:** refactor(routes): split app into talent/dev/pedago/admin spaces ([#24](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/24))

---

### 2026-04-16

- **added:** feat: role-based staff routing and guards ([#25](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/25))

---

### 2026-04-17

- **added:** feat(onboarding): add onboarding signatures steps ([#15](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/15))
- Chore/security hardening ([#10](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/10))

---

### 2026-04-21

- Implement S3 Service ([#27](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/27))
- Feat/parent portal ([#30](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/30))

---

### 2026-04-24

- **changed:** refactor(staff): split dev/pedago + planning 1:1 + UI sweep ([#29](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/29))
- Displaying the latest sync date from worker to the admin area ([#28](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/28))
- **fixed:** fix(admin): accept "admin" user role for inviting users (on the admin area) ([#32](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/32))
- Feat/planning previews talent calendar ([#33](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/33))

---

### 2026-04-26

- **fixed:** fix(deps): bump postcss to 8.5.10 (GHSA-qx2v-qp2m-jg93) ([#37](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/37))
- **fixed:** fix(seed): inline EVENT_TYPES so seed runs without src/ ([#36](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/36))
- **fixed:** fix(admin): stop FK errors on users page load ([#35](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/35))

---

### 2026-04-27

- **fixed:** fix(api): use staffProfile for diploma/students auth ([#41](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/41))
- **changed:** refactor(auth): refresh user role in hooks, drop dual checks ([#42](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/42))
- **fixed:** fix(storage): migrate storage service to use S3 for onboarding PDFs ([#39](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/39))
- **added:** feat(seed): add minimal production seed script for first admin user creation ([#43](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/43))
- **fixed:** fix: conserve scripts folder ([#45](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/45))
- Rework parent signature flow to standard BetterAuth OTP ([#31](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/31))

---

### 2026-04-28

- **added:** feat(markdown): Notion-like markdown rendering for Talent space ([#40](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/40))
- **fixed:** fix(auth): enable account linking with trusted providers ([#46](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/46))
- **fixed:** fix(db): remove duplicate StageCompliance migration ([#47](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/47))
- **added:** feat: rework staff event pages, regroup sidebars, polish talent fiche ([#48](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/48))
- Adding a script to manualy accept a pending staff invitation ([#50](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/50))
- Fix discord redirect url building ([#51](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/51))
- Implement the "Login As" functionality for admins ([#49](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/49))
- **fixed:** fix(admin): seed campus create form with default-enabled flags ([#52](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/52))

---

### 2026-04-29

- Remove password system for admin staff. ([#53](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/53))
- **added:** feat(auth): disable password authentication globally ([#55](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/55))
- **added:** feat(staff/pedago): rebuild presences flow + readability pass ([#56](https://github.com/Manta-Epitech-Academy/intra-epitech-academy/pull/56))

