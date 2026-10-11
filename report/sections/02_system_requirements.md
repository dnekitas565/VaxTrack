# 2. SYSTEM REQUIREMENTS

Values below were read from the machine on which the project was built and tested (10 Oct 2026).

## 2.1 Hardware Requirements

| Component | Specification |
|---|---|
| Processor | Intel Core Ultra 7 155U, 12 cores, 14 logical processors |
| RAM | 16 GB installed class (15.4 GB usable) |
| Storage | 512 GB class NVMe SSD (KIOXIA, 477 GB formatted) |
| Other | None. The application runs in a desktop or phone web browser; no mobile device or special hardware is needed |

We did not test on a smaller machine, so these figures describe what we used and not a minimum.

## 2.2 Software Requirements

| Category | Tool / Version |
|---|---|
| Operating System | Windows 11 Home Single Language, version 10.0.26200 |
| DBMS | Oracle Database 21c Express Edition, release 21.3.0.0.0, pluggable database XEPDB1, application schema `vaxapp` |
| Query / IDE Tool | SQL*Plus 21.3.0.0.0 for running the scripts; Visual Studio Code for editing <!-- TODO (team): add "Oracle SQL Developer for VS Code" if the team used it --> |
| Front-End Language | JavaScript (React 18.3.1, Vite 8.3.2, Tailwind CSS 4.3.3, React Router 7.18.4, TanStack Query 5.104.1, Recharts 3.10.1, lucide-react 1.52.0) |
| Back-End | Node.js 24.13.1 (the project needs 20 or later), npm 11.14.1, Express 5.2.1 |
| Connectivity | node-oracledb 7.0.1 in thin mode (no Oracle Client installation needed) |
| Security libraries | bcrypt 6.0.0, jsonwebtoken 9.0.3, helmet 8.3.0, cors 2.8.6, zod 4.6.5 |
| Browser | Microsoft Edge 155 (Chromium) |
| Other Tools | Git 2.53.0, Mermaid for the ER and architecture diagrams, Lighthouse and Playwright (driving Edge) for the accessibility and browser checks |

The Oracle features we used are described in [3]–[5]; the driver, server, front-end and style libraries in [7]–[11].
