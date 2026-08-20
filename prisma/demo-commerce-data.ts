export type DemoVariantDefinition = {
  sku: string;
  name: string;
  color: string;
  capacity: string;
  ram: string | null;
  country: string;
  price: number;
  oldPrice: number | null;
};

export type DemoSpecDefinition = {
  group: string;
  key: string;
  label: string;
  value: string;
  unit?: string;
};

export type DemoProductDefinition = {
  category: string;
  name: string;
  slug: string;
  description: string;
  variants: DemoVariantDefinition[];
  specs?: DemoSpecDefinition[];
  promotions?: string[];
};

export const demoCategories = [
  ["iPhone", "iphone", 1],
  ["MacBook", "macbook", 2],
  ["iPad", "ipad", 3],
  ["Apple Watch", "apple-watch", 4],
  ["Camera", "camera", 5],
  ["Âm thanh", "am-thanh", 6],
  ["iMac", "imac", 7],
  ["Phụ kiện", "phu-kien", 8],
] as const;

const variant = (
  sku: string,
  name: string,
  color: string,
  capacity: string,
  ram: string | null,
  price: number,
  oldPrice: number | null = null,
  country = "VN/A",
): DemoVariantDefinition => ({
  sku,
  name,
  color,
  capacity,
  ram,
  country,
  price,
  oldPrice,
});

const specs = (values: {
  displaySize: string;
  displayTechnology: string;
  chip: string;
  ram: string;
  storage: string;
  camera: string;
  battery: string;
  connectivity: string;
}): DemoSpecDefinition[] => [
  { group: "Màn hình", key: "display_size", label: "Kích thước màn hình", value: values.displaySize },
  { group: "Màn hình", key: "display_technology", label: "Công nghệ màn hình", value: values.displayTechnology },
  { group: "Hiệu năng", key: "chip", label: "Chip xử lý", value: values.chip },
  { group: "Hiệu năng", key: "ram", label: "RAM", value: values.ram },
  { group: "Bộ nhớ", key: "storage", label: "Dung lượng lưu trữ", value: values.storage },
  { group: "Camera", key: "camera", label: "Camera", value: values.camera },
  { group: "Pin / nguồn", key: "battery", label: "Pin / thời lượng sử dụng", value: values.battery },
  { group: "Kết nối", key: "connectivity", label: "Kết nối", value: values.connectivity },
];

export const demoProducts: DemoProductDefinition[] = [
  {
    category: "iphone",
    name: "iPhone 16 Pro Max",
    slug: "demo-iphone-16-pro-max",
    description: "iPhone 16 Pro Max với màn hình Super Retina XDR 6,9 inch, chip A18 Pro và hệ thống camera Pro.",
    variants: [
      variant("DEMO-IP16PM-DT-256", "Titan Sa Mạc 256GB", "Titan Sa Mạc", "256GB", "8GB", 34_990_000, 37_990_000),
      variant("DEMO-IP16PM-NT-512", "Titan Tự Nhiên 512GB", "Titan Tự Nhiên", "512GB", "8GB", 41_990_000, 44_990_000),
      variant("DEMO-IP16PM-BT-1TB", "Titan Đen 1TB", "Titan Đen", "1TB", "8GB", 49_990_000, 52_990_000),
    ],
    specs: specs({ displaySize: "6,9 inch", displayTechnology: "Super Retina XDR OLED, ProMotion", chip: "Apple A18 Pro", ram: "8GB", storage: "256GB, 512GB, 1TB", camera: "Fusion 48MP, Ultra Wide 48MP, Telephoto 5x", battery: "Xem video lên đến 33 giờ", connectivity: "5G, Wi‑Fi 7, Bluetooth 5.3, USB‑C" }),
    promotions: ["Hỗ trợ trả góp qua thẻ tín dụng", "Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "iphone",
    name: "iPhone 16 Pro",
    slug: "demo-iphone-16-pro",
    description: "iPhone 16 Pro nhỏ gọn với chip A18 Pro, Camera Control và màn hình ProMotion 6,3 inch.",
    variants: [
      variant("DEMO-IP16P-BT-128", "Titan Đen 128GB", "Titan Đen", "128GB", "8GB", 28_990_000, 31_990_000),
      variant("DEMO-IP16P-WT-256", "Titan Trắng 256GB", "Titan Trắng", "256GB", "8GB", 31_990_000, 34_990_000),
      variant("DEMO-IP16P-NT-512", "Titan Tự Nhiên 512GB", "Titan Tự Nhiên", "512GB", "8GB", 38_990_000, 41_990_000),
    ],
    specs: specs({ displaySize: "6,3 inch", displayTechnology: "Super Retina XDR OLED, ProMotion", chip: "Apple A18 Pro", ram: "8GB", storage: "128GB, 256GB, 512GB", camera: "Fusion 48MP, Ultra Wide 48MP, Telephoto 5x", battery: "Xem video lên đến 27 giờ", connectivity: "5G, Wi‑Fi 7, Bluetooth 5.3, USB‑C" }),
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "iphone",
    name: "iPhone 16 Plus",
    slug: "demo-iphone-16-plus",
    description: "iPhone 16 Plus có màn hình 6,7 inch, chip A18 và thời lượng pin dài.",
    variants: [
      variant("DEMO-IP16PL-BLK-128", "Đen 128GB", "Đen", "128GB", "8GB", 24_990_000, 25_990_000),
      variant("DEMO-IP16PL-PNK-256", "Hồng 256GB", "Hồng", "256GB", "8GB", 27_990_000, 28_990_000),
      variant("DEMO-IP16PL-UTM-512", "Xanh Lưu Ly 512GB", "Xanh Lưu Ly", "512GB", "8GB", 33_990_000, 34_990_000),
    ],
    specs: specs({ displaySize: "6,7 inch", displayTechnology: "Super Retina XDR OLED", chip: "Apple A18", ram: "8GB", storage: "128GB, 256GB, 512GB", camera: "Fusion 48MP, Ultra Wide 12MP", battery: "Xem video lên đến 27 giờ", connectivity: "5G, Wi‑Fi 7, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "iphone",
    name: "iPhone 16",
    slug: "demo-iphone-16",
    description: "iPhone 16 với chip A18, Camera Control và thiết kế nhôm bền bỉ.",
    variants: [
      variant("DEMO-IP16-BLK-128", "Đen 128GB", "Đen", "128GB", "8GB", 21_990_000, 22_990_000),
      variant("DEMO-IP16-TEL-256", "Xanh Mòng Két 256GB", "Xanh Mòng Két", "256GB", "8GB", 24_990_000, 25_990_000),
      variant("DEMO-IP16-PNK-512", "Hồng 512GB", "Hồng", "512GB", "8GB", 30_990_000, 31_990_000),
    ],
    specs: specs({ displaySize: "6,1 inch", displayTechnology: "Super Retina XDR OLED", chip: "Apple A18", ram: "8GB", storage: "128GB, 256GB, 512GB", camera: "Fusion 48MP, Ultra Wide 12MP", battery: "Xem video lên đến 22 giờ", connectivity: "5G, Wi‑Fi 7, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "iphone",
    name: "iPhone 15",
    slug: "demo-iphone-15",
    description: "iPhone 15 với Dynamic Island, camera chính 48MP và cổng USB‑C.",
    variants: [
      variant("DEMO-IP15-BLK-128", "Đen 128GB", "Đen", "128GB", "6GB", 17_990_000, 19_990_000),
      variant("DEMO-IP15-BLU-256", "Xanh Dương 256GB", "Xanh Dương", "256GB", "6GB", 20_990_000, 22_990_000),
      variant("DEMO-IP15-PNK-512", "Hồng 512GB", "Hồng", "512GB", "6GB", 25_990_000, 27_990_000),
    ],
    specs: specs({ displaySize: "6,1 inch", displayTechnology: "Super Retina XDR OLED", chip: "Apple A16 Bionic", ram: "6GB", storage: "128GB, 256GB, 512GB", camera: "Chính 48MP, Ultra Wide 12MP", battery: "Xem video lên đến 20 giờ", connectivity: "5G, Wi‑Fi 6, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "macbook",
    name: "MacBook Air 13 inch M4",
    slug: "demo-macbook-air-13-m4",
    description: "MacBook Air 13 inch dùng chip Apple M4, thiết kế mỏng nhẹ và không quạt.",
    variants: [
      variant("DEMO-MBA13M4-SKY-16-256", "Xanh Da Trời 16GB/256GB", "Xanh Da Trời", "256GB", "16GB", 26_990_000, 27_990_000),
      variant("DEMO-MBA13M4-MID-16-512", "Đêm Xanh Thẳm 16GB/512GB", "Đêm Xanh Thẳm", "512GB", "16GB", 31_990_000, 32_990_000),
      variant("DEMO-MBA13M4-SLV-24-512", "Bạc 24GB/512GB", "Bạc", "512GB", "24GB", 36_990_000, null),
    ],
    specs: specs({ displaySize: "13,6 inch", displayTechnology: "Liquid Retina IPS", chip: "Apple M4", ram: "16GB hoặc 24GB", storage: "256GB hoặc 512GB SSD", camera: "12MP Center Stage", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt 4" }),
    promotions: ["Hỗ trợ trả góp qua thẻ tín dụng"],
  },
  {
    category: "macbook",
    name: "MacBook Air 15 inch M4",
    slug: "demo-macbook-air-15-m4",
    description: "MacBook Air 15 inch M4 mang lại không gian hiển thị lớn trong thiết kế mỏng nhẹ.",
    variants: [
      variant("DEMO-MBA15M4-SKY-16-256", "Xanh Da Trời 16GB/256GB", "Xanh Da Trời", "256GB", "16GB", 31_990_000, 32_990_000),
      variant("DEMO-MBA15M4-SLG-16-512", "Ánh Sao 16GB/512GB", "Ánh Sao", "512GB", "16GB", 36_990_000, 37_990_000),
      variant("DEMO-MBA15M4-MID-24-512", "Đêm Xanh Thẳm 24GB/512GB", "Đêm Xanh Thẳm", "512GB", "24GB", 41_990_000, null),
    ],
    specs: specs({ displaySize: "15,3 inch", displayTechnology: "Liquid Retina IPS", chip: "Apple M4", ram: "16GB hoặc 24GB", storage: "256GB hoặc 512GB SSD", camera: "12MP Center Stage", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt 4" }),
  },
  {
    category: "macbook",
    name: "MacBook Pro 14 inch M4",
    slug: "demo-macbook-pro-14-m4",
    description: "MacBook Pro 14 inch với chip M4 và màn hình Liquid Retina XDR.",
    variants: [
      variant("DEMO-MBP14M4-SB-16-512", "Đen Không Gian 16GB/512GB", "Đen Không Gian", "512GB", "16GB", 39_990_000, 42_990_000),
      variant("DEMO-MBP14M4-SLV-16-1TB", "Bạc 16GB/1TB", "Bạc", "1TB", "16GB", 46_990_000, 49_990_000),
      variant("DEMO-MBP14M4-SB-24-1TB", "Đen Không Gian 24GB/1TB", "Đen Không Gian", "1TB", "24GB", 52_990_000, null),
    ],
    specs: specs({ displaySize: "14,2 inch", displayTechnology: "Liquid Retina XDR, ProMotion", chip: "Apple M4", ram: "16GB hoặc 24GB", storage: "512GB hoặc 1TB SSD", camera: "12MP Center Stage", battery: "Lên đến 24 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt 4, HDMI" }),
  },
  {
    category: "macbook",
    name: "MacBook Pro 14 inch M4 Pro",
    slug: "demo-macbook-pro-14-m4-pro",
    description: "MacBook Pro 14 inch M4 Pro dành cho quy trình sáng tạo và kỹ thuật chuyên nghiệp.",
    variants: [
      variant("DEMO-MBP14M4P-SB-24-512", "Đen Không Gian 24GB/512GB", "Đen Không Gian", "512GB", "24GB", 49_990_000, 52_990_000),
      variant("DEMO-MBP14M4P-SLV-24-1TB", "Bạc 24GB/1TB", "Bạc", "1TB", "24GB", 56_990_000, 59_990_000),
      variant("DEMO-MBP14M4P-SB-48-1TB", "Đen Không Gian 48GB/1TB", "Đen Không Gian", "1TB", "48GB", 70_990_000, null),
    ],
    specs: specs({ displaySize: "14,2 inch", displayTechnology: "Liquid Retina XDR, ProMotion", chip: "Apple M4 Pro", ram: "24GB hoặc 48GB", storage: "512GB hoặc 1TB SSD", camera: "12MP Center Stage", battery: "Lên đến 22 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt 5, HDMI" }),
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "macbook",
    name: "MacBook Pro 16 inch M4 Pro",
    slug: "demo-macbook-pro-16-m4-pro",
    description: "MacBook Pro 16 inch M4 Pro có màn hình XDR lớn và hiệu năng bền bỉ cho công việc chuyên sâu.",
    variants: [
      variant("DEMO-MBP16M4P-SB-24-512", "Đen Không Gian 24GB/512GB", "Đen Không Gian", "512GB", "24GB", 62_990_000, 65_990_000),
      variant("DEMO-MBP16M4P-SLV-24-1TB", "Bạc 24GB/1TB", "Bạc", "1TB", "24GB", 69_990_000, 72_990_000),
      variant("DEMO-MBP16M4P-SB-48-1TB", "Đen Không Gian 48GB/1TB", "Đen Không Gian", "1TB", "48GB", 83_990_000, null),
    ],
    specs: specs({ displaySize: "16,2 inch", displayTechnology: "Liquid Retina XDR, ProMotion", chip: "Apple M4 Pro", ram: "24GB hoặc 48GB", storage: "512GB hoặc 1TB SSD", camera: "12MP Center Stage", battery: "Lên đến 24 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt 5, HDMI" }),
  },
  {
    category: "ipad",
    name: "iPad Pro 11 inch M4",
    slug: "demo-ipad-pro-11-m4",
    description: "iPad Pro 11 inch M4 với màn hình Ultra Retina XDR và thiết kế siêu mỏng.",
    variants: [
      variant("DEMO-IPP11M4-SG-256", "Đen Không Gian 256GB", "Đen Không Gian", "256GB", "8GB", 27_990_000, 29_990_000),
      variant("DEMO-IPP11M4-SLV-512", "Bạc 512GB", "Bạc", "512GB", "8GB", 34_990_000, 36_990_000),
      variant("DEMO-IPP11M4-SG-1TB", "Đen Không Gian 1TB", "Đen Không Gian", "1TB", "16GB", 46_990_000, null),
    ],
    specs: specs({ displaySize: "11 inch", displayTechnology: "Ultra Retina XDR Tandem OLED, ProMotion", chip: "Apple M4", ram: "8GB hoặc 16GB", storage: "256GB, 512GB, 1TB", camera: "Wide 12MP, LiDAR", battery: "Lướt web lên đến 10 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt / USB 4" }),
    promotions: ["Tương thích Apple Pencil Pro"],
  },
  {
    category: "ipad",
    name: "iPad Pro 13 inch M4",
    slug: "demo-ipad-pro-13-m4",
    description: "iPad Pro 13 inch M4 kết hợp màn hình OLED lớn và hiệu năng Apple silicon.",
    variants: [
      variant("DEMO-IPP13M4-SG-256", "Đen Không Gian 256GB", "Đen Không Gian", "256GB", "8GB", 36_990_000, 38_990_000),
      variant("DEMO-IPP13M4-SLV-512", "Bạc 512GB", "Bạc", "512GB", "8GB", 43_990_000, 45_990_000),
      variant("DEMO-IPP13M4-SG-1TB", "Đen Không Gian 1TB", "Đen Không Gian", "1TB", "16GB", 55_990_000, null),
    ],
    specs: specs({ displaySize: "13 inch", displayTechnology: "Ultra Retina XDR Tandem OLED, ProMotion", chip: "Apple M4", ram: "8GB hoặc 16GB", storage: "256GB, 512GB, 1TB", camera: "Wide 12MP, LiDAR", battery: "Lướt web lên đến 10 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, Thunderbolt / USB 4" }),
  },
  {
    category: "ipad",
    name: "iPad Air 11 inch M3",
    slug: "demo-ipad-air-11-m3",
    description: "iPad Air 11 inch M3 hỗ trợ Apple Intelligence và Apple Pencil Pro.",
    variants: [
      variant("DEMO-IPA11M3-BLU-128", "Xanh Dương 128GB", "Xanh Dương", "128GB", "8GB", 16_990_000, 17_990_000),
      variant("DEMO-IPA11M3-PUR-256", "Tím 256GB", "Tím", "256GB", "8GB", 19_990_000, 20_990_000),
      variant("DEMO-IPA11M3-SG-512", "Xám Không Gian 512GB", "Xám Không Gian", "512GB", "8GB", 25_990_000, null),
    ],
    specs: specs({ displaySize: "11 inch", displayTechnology: "Liquid Retina IPS", chip: "Apple M3", ram: "8GB", storage: "128GB, 256GB, 512GB", camera: "Wide 12MP", battery: "Lướt web lên đến 10 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "ipad",
    name: "iPad Air 13 inch M3",
    slug: "demo-ipad-air-13-m3",
    description: "iPad Air 13 inch M3 có màn hình Liquid Retina lớn cho học tập và sáng tạo.",
    variants: [
      variant("DEMO-IPA13M3-SLG-128", "Ánh Sao 128GB", "Ánh Sao", "128GB", "8GB", 21_990_000, 22_990_000),
      variant("DEMO-IPA13M3-BLU-256", "Xanh Dương 256GB", "Xanh Dương", "256GB", "8GB", 24_990_000, 25_990_000),
      variant("DEMO-IPA13M3-SG-512", "Xám Không Gian 512GB", "Xám Không Gian", "512GB", "8GB", 30_990_000, null),
    ],
    specs: specs({ displaySize: "13 inch", displayTechnology: "Liquid Retina IPS", chip: "Apple M3", ram: "8GB", storage: "128GB, 256GB, 512GB", camera: "Wide 12MP", battery: "Lướt web lên đến 10 giờ", connectivity: "Wi‑Fi 6E, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "ipad",
    name: "iPad A16",
    slug: "demo-ipad-a16",
    description: "iPad A16 là mẫu iPad đa dụng với màn hình Liquid Retina 11 inch và Touch ID.",
    variants: [
      variant("DEMO-IPADA16-BLU-128", "Xanh Dương 128GB", "Xanh Dương", "128GB", "6GB", 9_990_000, 10_990_000),
      variant("DEMO-IPADA16-PNK-256", "Hồng 256GB", "Hồng", "256GB", "6GB", 12_490_000, 13_490_000),
      variant("DEMO-IPADA16-SLV-512", "Bạc 512GB", "Bạc", "512GB", "6GB", 17_490_000, null),
    ],
    specs: specs({ displaySize: "11 inch", displayTechnology: "Liquid Retina IPS", chip: "Apple A16", ram: "6GB", storage: "128GB, 256GB, 512GB", camera: "Wide 12MP", battery: "Lướt web lên đến 10 giờ", connectivity: "Wi‑Fi 6, Bluetooth 5.3, USB‑C" }),
  },
  {
    category: "apple-watch",
    name: "Apple Watch Series 10 42mm",
    slug: "demo-apple-watch-series-10-42mm",
    description: "Apple Watch Series 10 42mm có màn hình góc rộng, thiết kế mỏng và cảm biến sức khỏe nâng cao.",
    variants: [
      variant("DEMO-AWS10-42-JB", "Nhôm Đen Bóng 42mm", "Đen Bóng", "64GB", "1GB", 10_990_000, 11_990_000),
      variant("DEMO-AWS10-42-RG", "Nhôm Vàng Hồng 42mm", "Vàng Hồng", "64GB", "1GB", 10_990_000, 11_990_000),
      variant("DEMO-AWS10-42-SLV", "Nhôm Bạc 42mm", "Bạc", "64GB", "1GB", 10_990_000, 11_990_000),
    ],
    specs: specs({ displaySize: "42mm", displayTechnology: "LTPO3 OLED Always‑On", chip: "Apple S10 SiP", ram: "1GB", storage: "64GB", camera: "Không có", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 4, Bluetooth 5.3, GPS" }),
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "apple-watch",
    name: "Apple Watch Series 10 46mm",
    slug: "demo-apple-watch-series-10-46mm",
    description: "Apple Watch Series 10 46mm có màn hình lớn, sạc nhanh và khả năng chống nước 50 mét.",
    variants: [
      variant("DEMO-AWS10-46-JB", "Nhôm Đen Bóng 46mm", "Đen Bóng", "64GB", "1GB", 11_790_000, 12_790_000),
      variant("DEMO-AWS10-46-RG", "Nhôm Vàng Hồng 46mm", "Vàng Hồng", "64GB", "1GB", 11_790_000, 12_790_000),
      variant("DEMO-AWS10-46-SLV", "Nhôm Bạc 46mm", "Bạc", "64GB", "1GB", 11_790_000, 12_790_000),
    ],
    specs: specs({ displaySize: "46mm", displayTechnology: "LTPO3 OLED Always‑On", chip: "Apple S10 SiP", ram: "1GB", storage: "64GB", camera: "Không có", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 4, Bluetooth 5.3, GPS" }),
  },
  {
    category: "apple-watch",
    name: "Apple Watch Ultra 2",
    slug: "demo-apple-watch-ultra-2",
    description: "Apple Watch Ultra 2 vỏ titan 49mm dành cho hoạt động ngoài trời và thể thao sức bền.",
    variants: [
      variant("DEMO-AWU2-NAT-ALP", "Titan Tự Nhiên Alpine Loop", "Titan Tự Nhiên", "64GB", "1GB", 21_990_000, 22_990_000),
      variant("DEMO-AWU2-BLK-OCE", "Titan Đen Ocean Band", "Titan Đen", "64GB", "1GB", 21_990_000, 22_990_000),
      variant("DEMO-AWU2-NAT-TRL", "Titan Tự Nhiên Trail Loop", "Titan Tự Nhiên", "64GB", "1GB", 21_990_000, 22_990_000),
    ],
    specs: specs({ displaySize: "49mm", displayTechnology: "LTPO2 OLED Always‑On, 3000 nit", chip: "Apple S9 SiP", ram: "1GB", storage: "64GB", camera: "Không có", battery: "Lên đến 36 giờ", connectivity: "LTE, Wi‑Fi 4, Bluetooth 5.3, GPS băng tần kép" }),
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "apple-watch",
    name: "Apple Watch SE thế hệ 2 40mm",
    slug: "demo-apple-watch-se-2-40mm",
    description: "Apple Watch SE thế hệ 2 40mm cung cấp các tính năng vận động, an toàn và kết nối thiết yếu.",
    variants: [
      variant("DEMO-AWSE2-40-MID", "Nhôm Đêm Xanh Thẳm 40mm", "Đêm Xanh Thẳm", "32GB", "1GB", 5_990_000, 6_490_000),
      variant("DEMO-AWSE2-40-SLG", "Nhôm Ánh Sao 40mm", "Ánh Sao", "32GB", "1GB", 5_990_000, 6_490_000),
      variant("DEMO-AWSE2-40-SLV", "Nhôm Bạc 40mm", "Bạc", "32GB", "1GB", 5_990_000, 6_490_000),
    ],
    specs: specs({ displaySize: "40mm", displayTechnology: "Retina LTPO OLED", chip: "Apple S8 SiP", ram: "1GB", storage: "32GB", camera: "Không có", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 4, Bluetooth 5.3, GPS" }),
  },
  {
    category: "apple-watch",
    name: "Apple Watch SE thế hệ 2 44mm",
    slug: "demo-apple-watch-se-2-44mm",
    description: "Apple Watch SE thế hệ 2 44mm có màn hình lớn và các tính năng phát hiện va chạm, theo dõi sức khỏe.",
    variants: [
      variant("DEMO-AWSE2-44-MID", "Nhôm Đêm Xanh Thẳm 44mm", "Đêm Xanh Thẳm", "32GB", "1GB", 6_790_000, 7_290_000),
      variant("DEMO-AWSE2-44-SLG", "Nhôm Ánh Sao 44mm", "Ánh Sao", "32GB", "1GB", 6_790_000, 7_290_000),
      variant("DEMO-AWSE2-44-SLV", "Nhôm Bạc 44mm", "Bạc", "32GB", "1GB", 6_790_000, 7_290_000),
    ],
    specs: specs({ displaySize: "44mm", displayTechnology: "Retina LTPO OLED", chip: "Apple S8 SiP", ram: "1GB", storage: "32GB", camera: "Không có", battery: "Lên đến 18 giờ", connectivity: "Wi‑Fi 4, Bluetooth 5.3, GPS" }),
  },
  {
    category: "camera",
    name: "DJI Osmo Pocket 3",
    slug: "demo-dji-osmo-pocket-3",
    description: "Camera gimbal nhỏ gọn với cảm biến CMOS 1 inch, quay video 4K/120fps và màn hình xoay 2 inch.",
    variants: [
      variant("DEMO-OP3-STD", "Bản tiêu chuẩn", "Đen", "Không áp dụng", null, 12_490_000, 13_490_000, "Quốc tế"),
      variant("DEMO-OP3-CREATOR", "Creator Combo", "Đen", "Không áp dụng", null, 16_490_000, 17_490_000, "Quốc tế"),
    ],
    promotions: ["Bảo hành chính hãng theo chính sách nhà sản xuất"],
  },
  {
    category: "camera",
    name: "Insta360 X4",
    slug: "demo-insta360-x4",
    description: "Camera 360 độ quay video 8K, chống rung FlowState và thiết kế chống nước.",
    variants: [
      variant("DEMO-X4-STD", "Bản tiêu chuẩn", "Đen", "Không áp dụng", null, 11_990_000, 12_990_000, "Quốc tế"),
      variant("DEMO-X4-ADV", "Adventure Bundle", "Đen", "Không áp dụng", null, 14_990_000, 15_990_000, "Quốc tế"),
    ],
  },
  {
    category: "am-thanh",
    name: "AirPods 4",
    slug: "demo-airpods-4",
    description: "AirPods 4 với thiết kế mới, chip H2 và hộp sạc USB‑C.",
    variants: [
      variant("DEMO-AP4-STD", "AirPods 4", "Trắng", "Không áp dụng", null, 3_490_000, 3_790_000),
      variant("DEMO-AP4-ANC", "AirPods 4 Chống Ồn Chủ Động", "Trắng", "Không áp dụng", null, 4_790_000, 4_990_000),
    ],
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "am-thanh",
    name: "AirPods Pro thế hệ 2 USB‑C",
    slug: "demo-airpods-pro-2-usb-c",
    description: "AirPods Pro thế hệ 2 với chống ồn chủ động, Adaptive Audio và hộp sạc MagSafe USB‑C.",
    variants: [
      variant("DEMO-APP2-USBC", "Hộp sạc MagSafe USB‑C", "Trắng", "Không áp dụng", null, 5_490_000, 6_190_000),
      variant("DEMO-APP2-USBC-CARE", "Kèm AppleCare+", "Trắng", "Không áp dụng", null, 6_290_000, null),
    ],
  },
  {
    category: "am-thanh",
    name: "AirPods Max USB‑C",
    slug: "demo-airpods-max-usb-c",
    description: "Tai nghe chụp tai AirPods Max với chống ồn chủ động, Spatial Audio và cổng USB‑C.",
    variants: [
      variant("DEMO-APMAX-MID", "Đêm Xanh Thẳm", "Đêm Xanh Thẳm", "Không áp dụng", null, 13_990_000, 14_990_000),
      variant("DEMO-APMAX-ORG", "Cam", "Cam", "Không áp dụng", null, 13_990_000, 14_990_000),
    ],
  },
  {
    category: "am-thanh",
    name: "HomePod mini",
    slug: "demo-homepod-mini",
    description: "Loa thông minh nhỏ gọn hỗ trợ âm thanh 360 độ, Siri và hệ sinh thái Apple Home.",
    variants: [
      variant("DEMO-HPM-WHT", "Trắng", "Trắng", "Không áp dụng", null, 2_790_000, 2_990_000),
      variant("DEMO-HPM-MID", "Đêm Xanh Thẳm", "Đêm Xanh Thẳm", "Không áp dụng", null, 2_790_000, 2_990_000),
    ],
  },
  {
    category: "imac",
    name: "iMac 24 inch M4 8-core GPU",
    slug: "demo-imac-24-m4-8-core",
    description: "iMac 24 inch M4 với màn hình Retina 4.5K, thiết kế all-in-one và GPU 8 lõi.",
    variants: [
      variant("DEMO-IMACM4-8-BLU-16-256", "Xanh Dương 16GB/256GB", "Xanh Dương", "256GB", "16GB", 34_990_000, 36_990_000),
      variant("DEMO-IMACM4-8-GRN-16-256", "Xanh Lá 16GB/256GB", "Xanh Lá", "256GB", "16GB", 34_990_000, 36_990_000),
      variant("DEMO-IMACM4-8-PNK-24-512", "Hồng 24GB/512GB", "Hồng", "512GB", "24GB", 45_990_000, null),
    ],
    promotions: ["Bảo hành chính hãng Apple 12 tháng"],
  },
  {
    category: "imac",
    name: "iMac 24 inch M4 10-core GPU",
    slug: "demo-imac-24-m4-10-core",
    description: "iMac 24 inch M4 cấu hình GPU 10 lõi, màn hình Retina 4.5K và bốn cổng Thunderbolt 4.",
    variants: [
      variant("DEMO-IMACM4-10-SLV-16-256", "Bạc 16GB/256GB", "Bạc", "256GB", "16GB", 39_990_000, 41_990_000),
      variant("DEMO-IMACM4-10-PUR-16-512", "Tím 16GB/512GB", "Tím", "512GB", "16GB", 45_990_000, 47_990_000),
      variant("DEMO-IMACM4-10-YLW-24-512", "Vàng 24GB/512GB", "Vàng", "512GB", "24GB", 50_990_000, null),
    ],
  },
  {
    category: "phu-kien",
    name: "Belkin UltraGlass 2 cho iPhone 16 Pro Max",
    slug: "demo-belkin-ultraglass-2-iphone-16-pro-max",
    description: "Kính bảo vệ màn hình Belkin UltraGlass 2 tương thích iPhone 16 Pro Max.",
    variants: [variant("DEMO-ACC-GLASS-IP16PM", "Trong suốt", "Trong suốt", "6,9 inch", null, 990_000, null, "Quốc tế")],
  },
  {
    category: "phu-kien",
    name: "Ốp lưng Silicone MagSafe cho iPhone 16 Pro",
    slug: "demo-apple-silicone-case-iphone-16-pro",
    description: "Ốp lưng silicone Apple tích hợp MagSafe dành cho iPhone 16 Pro.",
    variants: [variant("DEMO-ACC-CASE-IP16P-BLK", "Đen", "Đen", "6,3 inch", null, 1_490_000)],
  },
  {
    category: "phu-kien",
    name: "Cáp sạc USB‑C Apple 1m",
    slug: "demo-apple-usb-c-charge-cable-1m",
    description: "Cáp sạc USB‑C bện dài 1 mét, hỗ trợ sạc và truyền dữ liệu USB 2.",
    variants: [variant("DEMO-ACC-USBC-1M", "Dài 1 mét", "Trắng", "1m", null, 490_000)],
  },
  {
    category: "phu-kien",
    name: "Củ sạc Apple USB‑C 20W",
    slug: "demo-apple-20w-usb-c-power-adapter",
    description: "Bộ tiếp hợp nguồn USB‑C 20W của Apple hỗ trợ sạc nhanh cho iPhone và iPad.",
    variants: [variant("DEMO-ACC-CHARGER-20W", "20W", "Trắng", "20W", null, 550_000)],
  },
  {
    category: "phu-kien",
    name: "Satechi USB‑C Multiport Adapter 8K",
    slug: "demo-satechi-usb-c-multiport-adapter-8k",
    description: "Hub USB‑C đa cổng với HDMI 8K, Ethernet, USB‑A và đầu đọc thẻ nhớ.",
    variants: [variant("DEMO-ACC-HUB-SATECHI-8K", "Xám Không Gian", "Xám Không Gian", "8 cổng", null, 2_490_000, 2_790_000, "Quốc tế")],
  },
  {
    category: "phu-kien",
    name: "AirTag 1 Pack",
    slug: "demo-apple-airtag-1-pack",
    description: "Thiết bị định vị AirTag dùng mạng lưới Find My và chip Ultra Wideband.",
    variants: [variant("DEMO-ACC-AIRTAG-1", "Gói 1 chiếc", "Trắng", "1 chiếc", null, 790_000, 890_000)],
  },
];

export const demoSuppliers = [
  { name: "[WebApple Demo] Apple Distribution", phone: "0900000091", email: "apple.distribution@webapple.demo", address: "Kho phân phối WebApple, Thành phố Hồ Chí Minh" },
  { name: "[WebApple Demo] Wearables & Audio", phone: "0900000092", email: "wearables.audio@webapple.demo", address: "Kho thiết bị đeo và âm thanh WebApple, Hà Nội" },
  { name: "[WebApple Demo] Accessories & Camera", phone: "0900000093", email: "accessories.camera@webapple.demo", address: "Kho phụ kiện và camera WebApple, Đà Nẵng" },
] as const;

export const demoReceipts = [
  { key: "DEMO-RCV-001", createdAt: new Date("2026-01-05T02:00:00.000Z"), supplier: demoSuppliers[0].name, categories: ["iphone", "ipad"] },
  { key: "DEMO-RCV-002", createdAt: new Date("2026-01-06T02:00:00.000Z"), supplier: demoSuppliers[0].name, categories: ["macbook", "imac"] },
  { key: "DEMO-RCV-003", createdAt: new Date("2026-01-07T02:00:00.000Z"), supplier: demoSuppliers[1].name, categories: ["apple-watch", "am-thanh"] },
  { key: "DEMO-RCV-004", createdAt: new Date("2026-01-08T02:00:00.000Z"), supplier: demoSuppliers[2].name, categories: ["camera", "phu-kien"] },
] as const;

export const demoVouchers = [
  { code: "DEMO10", type: "Percent", value: 10, minimum: 1_000_000, maximum: 2_000_000, limit: 1000 },
  { code: "DEMO15", type: "Percent", value: 15, minimum: 5_000_000, maximum: 3_000_000, limit: 500 },
  { code: "DEMO50K", type: "Fixed", value: 50_000, minimum: 500_000, maximum: null, limit: 2000 },
  { code: "DEMO100K", type: "Fixed", value: 100_000, minimum: 1_500_000, maximum: null, limit: 1500 },
  { code: "DEMO200K", type: "Fixed", value: 200_000, minimum: 3_000_000, maximum: null, limit: 1000 },
  { code: "WELCOME", type: "Percent", value: 8, minimum: 0, maximum: 1_000_000, limit: 5000 },
  { code: "ACCESSORY", type: "Fixed", value: 150_000, minimum: 1_000_000, maximum: null, limit: 750 },
  { code: "BIGORDER", type: "Percent", value: 12, minimum: 20_000_000, maximum: 4_000_000, limit: 300 },
] as const;

export const serializedCategorySlugs = new Set([
  "iphone",
  "macbook",
  "ipad",
  "apple-watch",
]);

export function desiredStockForCategory(categorySlug: string) {
  if (serializedCategorySlugs.has(categorySlug)) return 5;
  if (categorySlug === "phu-kien") return 20;
  if (categorySlug === "am-thanh") return 12;
  if (categorySlug === "imac") return 8;
  return 6;
}
