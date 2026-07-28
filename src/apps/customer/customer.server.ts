import "../../config/env";
import customerApp from "./customer.app";

const PORT = Number(process.env.CUSTOMER_API_PORT) || 5001;

// Khởi động Customer API ở port 5001
customerApp.listen(PORT, () => {
  console.log(`Customer API is running at http://localhost:${PORT}`);
});