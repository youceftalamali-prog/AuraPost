# Diff: package.json

```diff
--- original_reference/package.json	2026-07-06 18:23:36.000000000 +0000
+++ audit/package.json	2026-07-09 19:29:48.084445547 +0000
@@ -11,18 +11,24 @@
   },
   "dependencies": {
     "@google/genai": "latest",
+    "@sentry/node": "^10.64.0",
     "bcrypt": "^6.0.0",
+    "cors": "^2.8.6",
     "dotenv": "^16.4.5",
     "express": "^4.19.2",
+    "express-rate-limit": "^8.5.2",
+    "helmet": "^8.2.0",
     "jsonwebtoken": "^9.0.3",
     "jspdf": "^4.2.1",
     "lucide-react": "^0.400.0",
     "motion": "^11.11.17",
     "openai": "^6.42.0",
+    "pg": "^8.22.0",
+    "pino": "^10.3.1",
+    "pino-http": "^11.0.0",
     "react": "^18.3.1",
     "react-dom": "^18.3.1",
     "recharts": "^2.12.7",
-    "sql.js": "^1.10.3",
     "stripe": "^18.5.0",
     "uuid": "^10.0.0",
     "zod": "^4.4.3"
@@ -30,14 +36,17 @@
   "devDependencies": {
     "@tailwindcss/vite": "^4.3.1",
     "@types/bcrypt": "^6.0.0",
+    "@types/cors": "^2.8.19",
     "@types/express": "^4.17.21",
     "@types/jsonwebtoken": "^9.0.10",
+    "@types/pg": "^8.20.0",
     "@types/react": "^18.3.3",
     "@types/react-dom": "^18.3.0",
     "@types/sql.js": "^1.4.9",
     "@types/uuid": "^10.0.0",
     "@vitejs/plugin-react": "^4.3.1",
     "esbuild": "^0.21.5",
+    "sql.js": "^1.10.3",
     "tailwindcss": "^4.3.1",
     "tsx": "^4.15.6",
     "typescript": "^5.4.5",
```
