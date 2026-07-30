import "../../config/env";
import adminApp from "./admin.app";
import { validateCoreEnvironment } from "../../config/env";

const PORT = Number(process.env.ADMIN_API_PORT) || 5002;
validateCoreEnvironment();

// Khởi động Admin API ở port 5002
adminApp.listen(PORT, () => {
  console.log(`Admin API is running at http://localhost:${PORT}`);
});
