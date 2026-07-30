import "../../config/env";
import customerApp from "./customer.app";
import { validateCoreEnvironment } from "../../config/env";

const PORT = Number(process.env.CUSTOMER_API_PORT) || 5001;
validateCoreEnvironment();

// Khởi động Customer API ở port 5001
customerApp.listen(PORT, () => {
  console.log(`Customer API is running at http://localhost:${PORT}`);
});
