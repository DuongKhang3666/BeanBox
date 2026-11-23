/*
 * Danh sách thô sản phẩm của seed nhiều (D-084). Toàn bộ là dữ liệu GIẢ để thử giao diện/logic:
 * giá, tên và mô tả không phải thông tin thương mại thật; không có thông số kỹ thuật cụ thể.
 * Module thuần dữ liệu (không chạm DB). Việc dựng biến thể/giá/tồn kho nằm ở products.ts.
 */

export type Process = 'WASHED' | 'NATURAL' | 'HONEY' | 'ANAEROBIC' | 'OTHER';
export type Roast = 'LIGHT' | 'MEDIUM' | 'MEDIUM_DARK' | 'DARK';
export type Method =
  'PHIN' | 'ESPRESSO' | 'POUR_OVER' | 'COLD_BREW' | 'FRENCH_PRESS' | 'AEROPRESS' | 'MOKA';

/** [tên, danh mục, quốc gia, vùng, giống, sơ chế, mức rang, hương vị (csv), cách pha (csv), giá 250 g, loại] */
export type CoffeeDef = [
  name: string,
  cat: string,
  country: string,
  region: string,
  variety: string,
  process: Process,
  roast: Roast,
  notes: string,
  methods: string,
  price250: number,
  kind?: 'ground' | 'drip',
];

// prettier-ignore
export const COFFEES: CoffeeDef[] = [
  // Single Origin (14)
  ['Ethiopia Sidamo Washed', 'single-origin', 'Ethiopia', 'Sidamo', 'Heirloom', 'WASHED', 'LIGHT', 'Hoa cam,Chanh vàng,Mật ong', 'po,ae', 215000],
  ['Ethiopia Hambela Natural', 'single-origin', 'Ethiopia', 'Hambela', 'Heirloom', 'NATURAL', 'LIGHT', 'Dâu chín,Việt quất,Rượu vang', 'po,cb', 235000],
  ['Kenya Nyeri Washed', 'single-origin', 'Kenya', 'Nyeri', 'SL28', 'WASHED', 'LIGHT', 'Mận đen,Lý chua đen,Cam', 'po', 245000],
  ['Rwanda Nyamasheke Washed', 'single-origin', 'Rwanda', 'Nyamasheke', 'Bourbon', 'WASHED', 'LIGHT', 'Cam,Đường nâu,Trà đen', 'po,ae', 205000],
  ['Colombia Nariño Washed', 'single-origin', 'Colombia', 'Nariño', 'Caturra', 'WASHED', 'MEDIUM', 'Caramel,Táo đỏ,Cacao', 'po,esp', 195000],
  ['Costa Rica Tarrazú Honey', 'single-origin', 'Costa Rica', 'Tarrazú', 'Catuai', 'HONEY', 'MEDIUM', 'Mật mía,Mơ,Hạnh nhân', 'po,ae', 205000],
  ['Guatemala Antigua Washed', 'single-origin', 'Guatemala', 'Antigua', 'Bourbon', 'WASHED', 'MEDIUM', 'Cacao,Hạt phỉ,Cam', 'esp,po', 190000],
  ['Panama Boquete Washed', 'single-origin', 'Panama', 'Boquete', 'Caturra', 'WASHED', 'LIGHT', 'Hoa trắng,Đào,Trà xanh', 'po', 265000],
  ['Peru Cajamarca Washed', 'single-origin', 'Peru', 'Cajamarca', 'Typica', 'WASHED', 'MEDIUM', 'Chocolate sữa,Hạnh nhân,Táo', 'po,fp', 185000],
  ['Tanzania Mbeya Washed', 'single-origin', 'Tanzania', 'Mbeya', 'Bourbon', 'WASHED', 'MEDIUM', 'Mận,Cacao,Cam', 'po,fp', 190000],
  ['Indonesia Sumatra Mandheling', 'single-origin', 'Indonesia', 'Sumatra', 'Typica', 'OTHER', 'MEDIUM_DARK', 'Gỗ tuyết tùng,Cacao đen,Thảo mộc', 'fp,esp', 185000],
  ['Honduras Marcala Washed', 'single-origin', 'Honduras', 'Marcala', 'Catuai', 'WASHED', 'MEDIUM', 'Caramel,Táo xanh,Chocolate', 'po,esp', 180000],
  ['Brazil Mogiana Natural', 'single-origin', 'Brazil', 'Mogiana', 'Bourbon', 'NATURAL', 'MEDIUM', 'Hạt phỉ,Chocolate,Caramel', 'esp,phin', 175000],
  ['Việt Nam Khe Sanh Washed', 'single-origin', 'Việt Nam', 'Khe Sanh', 'Catimor', 'WASHED', 'MEDIUM', 'Cacao,Caramel,Hạnh nhân', 'phin,po', 165000],
  // Cà phê Việt (8)
  ['Robusta Đắk Lắk Rang Mộc', 'ca-phe-viet', 'Việt Nam', 'Đắk Lắk', 'Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao đắng,Gỗ,Caramel đậm', 'phin,esp', 110000],
  ['Robusta Honey Gia Lai', 'ca-phe-viet', 'Việt Nam', 'Gia Lai', 'Robusta', 'HONEY', 'MEDIUM', 'Mật mía,Hạt dẻ,Chocolate', 'phin', 125000],
  ['Arabica Lâm Đồng Natural', 'ca-phe-viet', 'Việt Nam', 'Lâm Đồng', 'Arabica', 'NATURAL', 'MEDIUM', 'Trái cây chín,Caramel,Mật ong', 'po,phin', 175000],
  ['Culi Kon Tum Rang Vừa', 'ca-phe-viet', 'Việt Nam', 'Kon Tum', 'Culi', 'WASHED', 'MEDIUM', 'Chocolate,Hạt dẻ,Đường nâu', 'phin,moka', 140000],
  ['Arabica Điện Biên Washed', 'ca-phe-viet', 'Việt Nam', 'Điện Biên', 'Catimor', 'WASHED', 'MEDIUM', 'Hoa,Mật ong,Cam', 'po,phin', 160000],
  ['Robusta Natural Đắk Nông', 'ca-phe-viet', 'Việt Nam', 'Đắk Nông', 'Robusta', 'NATURAL', 'MEDIUM', 'Trái cây khô,Chocolate,Hạt dẻ', 'phin,esp', 135000],
  ['Phin Đậm Vị Tây Nguyên', 'ca-phe-viet', 'Việt Nam', 'Tây Nguyên', 'Robusta', 'WASHED', 'DARK', 'Cacao,Khói nhẹ,Caramel cháy', 'phin', 105000],
  ['Arabica Sơn La Honey', 'ca-phe-viet', 'Việt Nam', 'Sơn La', 'Catimor', 'HONEY', 'MEDIUM', 'Mật ong,Cam,Hạnh nhân', 'po,phin', 165000],
  // Blend (6)
  ['Blend Sáng Sớm', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM', 'Caramel,Hạt dẻ,Chocolate sữa', 'phin,moka', 150000],
  ['Blend Espresso Đậm', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao đen,Caramel,Gỗ', 'esp', 160000],
  ['Blend Phin Sài Gòn', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM_DARK', 'Chocolate,Hạt dẻ,Đường thắng', 'phin', 130000],
  ['Blend Cold Brew Dịu Nhẹ', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica', 'NATURAL', 'MEDIUM', 'Trái cây,Caramel,Cacao', 'cb,fp', 155000],
  ['Blend Latte Sữa Ấm', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM_DARK', 'Chocolate sữa,Caramel,Hạt phỉ', 'esp,moka', 165000],
  ['Blend Moka Pot Gia Đình', 'blend', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao,Caramel,Hạt dẻ', 'moka,esp', 145000],
  // Decaf (2)
  ['Decaf Peru Cajamarca', 'decaf', 'Peru', 'Cajamarca', 'Typica', 'WASHED', 'MEDIUM', 'Chocolate,Hạnh nhân,Caramel', 'po,fp', 210000],
  ['Decaf Guatemala Huehuetenango', 'decaf', 'Guatemala', 'Huehuetenango', 'Bourbon', 'WASHED', 'MEDIUM', 'Cacao,Táo,Đường nâu', 'po,esp', 215000],
  // Cà phê rang xay (8)
  ['Rang Xay Truyền Thống Pha Phin', 'ca-phe-rang-xay', 'Việt Nam', 'Tây Nguyên', 'Robusta, Arabica', 'WASHED', 'MEDIUM_DARK', 'Cacao,Caramel,Hạt dẻ', 'phin', 95000, 'ground'],
  ['Rang Xay Nguyên Chất Đậm Đà', 'ca-phe-rang-xay', 'Việt Nam', 'Đắk Lắk', 'Robusta', 'WASHED', 'DARK', 'Cacao đắng,Khói nhẹ,Gỗ', 'phin', 90000, 'ground'],
  ['Rang Xay Arabica Thơm Nhẹ', 'ca-phe-rang-xay', 'Việt Nam', 'Lâm Đồng', 'Arabica', 'WASHED', 'MEDIUM', 'Hoa,Caramel,Cam', 'phin,po', 135000, 'ground'],
  ['Rang Xay Robusta Mạnh Vị', 'ca-phe-rang-xay', 'Việt Nam', 'Gia Lai', 'Robusta', 'WASHED', 'DARK', 'Chocolate đen,Gỗ,Đắng nhẹ', 'phin', 85000, 'ground'],
  ['Rang Xay Pha Máy Văn Phòng', 'ca-phe-rang-xay', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao,Caramel,Hạnh nhân', 'esp', 105000, 'ground'],
  ['Rang Xay Cân Bằng Mỗi Ngày', 'ca-phe-rang-xay', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM', 'Caramel,Hạt dẻ,Chocolate sữa', 'phin,moka', 100000, 'ground'],
  ['Rang Xay Hương Caramel Dịu', 'ca-phe-rang-xay', 'Việt Nam', 'Tây Nguyên', 'Arabica, Robusta', 'HONEY', 'MEDIUM', 'Caramel,Mật mía,Hạt dẻ', 'phin,moka', 110000, 'ground'],
  ['Rang Xay Tiết Kiệm Gia Đình', 'ca-phe-rang-xay', 'Việt Nam', 'Tây Nguyên', 'Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao,Gỗ,Caramel', 'phin', 75000, 'ground'],
  // Cà phê túi lọc (5)
  ['Túi Lọc Arabica Cầu Đất', 'ca-phe-tui-loc', 'Việt Nam', 'Cầu Đất', 'Arabica', 'WASHED', 'MEDIUM', 'Hoa,Caramel,Cam', 'po', 85000, 'drip'],
  ['Túi Lọc Robusta Đậm', 'ca-phe-tui-loc', 'Việt Nam', 'Đắk Lắk', 'Robusta', 'WASHED', 'MEDIUM_DARK', 'Cacao,Hạt dẻ,Gỗ', 'po', 70000, 'drip'],
  ['Túi Lọc Blend Dịu', 'ca-phe-tui-loc', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM', 'Caramel,Chocolate sữa,Hạnh nhân', 'po', 75000, 'drip'],
  ['Túi Lọc Specialty Ethiopia', 'ca-phe-tui-loc', 'Ethiopia', 'Sidamo', 'Heirloom', 'WASHED', 'LIGHT', 'Hoa cam,Chanh vàng,Mật ong', 'po', 120000, 'drip'],
  ['Túi Lọc Mix Nhiều Vị', 'ca-phe-tui-loc', 'Nhiều vùng', 'Phối trộn nhiều nguồn', 'Arabica, Robusta', 'WASHED', 'MEDIUM', 'Caramel,Cacao,Trái cây', 'po', 95000, 'drip'],
];

export type ToolKind = 'S' | 'C' | 'P' | '1';

/** [tên, danh mục, giá, khối lượng ước lượng (g), kiểu biến thể, mô tả, tag (csv)] */
export type ToolDef = [
  name: string,
  cat: string,
  price: number,
  weightGram: number,
  kind: ToolKind,
  desc: string,
  tags: string,
];

// prettier-ignore
export const TOOLS: ToolDef[] = [
  // Phin (7)
  ['Phin Nhôm Tiêu Chuẩn', 'phin', 39000, 110, 'S', 'Phin nhôm nhẹ, giá dễ chịu, hợp với người mới pha cà phê phin.', 'phin,nhôm,truyền thống'],
  ['Phin Inox Đáy Dày', 'phin', 69000, 160, 'S', 'Phin inox chắc tay, giữ nhiệt tốt và dễ làm sạch, dùng được lâu dài.', 'phin,inox,bền'],
  ['Phin Gốm Sứ Trắng', 'phin', 129000, 320, 'S', 'Phin gốm sứ men trắng, giữ nhiệt đều, đặt lên bàn pha chế trông rất gọn gàng.', 'phin,gốm,sứ'],
  ['Phin Nhôm Anod Nhiều Màu', 'phin', 59000, 120, 'C', 'Phin nhôm phủ màu, bề mặt bóng đẹp, hợp làm quà tặng nhỏ.', 'phin,nhôm,màu sắc'],
  ['Phin Inox Có Đế Hứng', 'phin', 89000, 260, 'S', 'Phin inox đi kèm đế hứng, đặt thẳng lên bàn mà không cần nhấc ly.', 'phin,inox,đế hứng'],
  ['Phin Pha Một Người Gọn Nhẹ', 'phin', 45000, 100, '1', 'Phin cỡ nhỏ cho một tách, tiện mang theo khi đi làm hoặc đi chơi.', 'phin,mini,du lịch'],
  ['Bộ Phin Kèm Ly Thủy Tinh', 'phin', 149000, 480, 'C', 'Bộ gồm phin và ly thủy tinh chịu nhiệt, tiện cho người mới bắt đầu.', 'phin,bộ,ly thủy tinh'],
  // Pour-over (8)
  ['Phễu Pour-over Sứ Hình Nón', 'pour-over', 185000, 330, 'C', 'Phễu sứ hình nón, giữ nhiệt tốt, dùng với giấy lọc hình nón.', 'phễu,sứ,pour-over'],
  ['Phễu Pour-over Thủy Tinh', 'pour-over', 220000, 300, 'S', 'Phễu thủy tinh trong suốt, dễ quan sát dòng cà phê khi chiết xuất.', 'phễu,thủy tinh,pour-over'],
  ['Phễu Pour-over Inox Gấp Gọn', 'pour-over', 159000, 150, '1', 'Phễu inox gấp phẳng, gọn trong balo, hợp khi đi cắm trại hoặc du lịch.', 'phễu,inox,du lịch'],
  ['Phễu Đáy Phẳng Sứ', 'pour-over', 245000, 420, 'C', 'Phễu đáy phẳng giúp nước phân bổ đều, dễ cho người mới làm quen pour-over.', 'phễu,đáy phẳng,sứ'],
  ['Bình Server Thủy Tinh', 'pour-over', 175000, 380, 'S', 'Bình hứng thủy tinh có vạch chia, đặt dưới phễu để chia cà phê ra ly.', 'server,thủy tinh,pour-over'],
  ['Bình Server Thủy Tinh Có Quai', 'pour-over', 215000, 450, 'S', 'Bình hứng có quai gỗ cầm chắc tay, nhìn ấm cúng trên quầy bar.', 'server,quai gỗ,pour-over'],
  ['Bộ Pour-over Du Lịch', 'pour-over', 329000, 650, '1', 'Bộ gọn gồm phễu, bình hứng và túi vải, đủ để pha một tách ở bất cứ đâu.', 'bộ,du lịch,pour-over'],
  ['Giá Đỡ Phễu Bằng Gỗ', 'pour-over', 139000, 500, '1', 'Giá gỗ đặt phễu lên cao vừa tầm để đặt ly hoặc bình hứng bên dưới.', 'giá đỡ,gỗ,pour-over'],
  // French Press, AeroPress & Moka Pot (7)
  ['Bình French Press Thủy Tinh', 'french-press-aeropress-moka-pot', 195000, 520, 'S', 'Bình French Press thân thủy tinh, pha nhanh, vị cà phê đậm và tròn.', 'french press,thủy tinh'],
  ['Bình French Press Inox Hai Lớp', 'french-press-aeropress-moka-pot', 329000, 700, 'S', 'Thân inox hai lớp giữ nhiệt lâu, không lo vỡ khi mang đi.', 'french press,inox,giữ nhiệt'],
  ['French Press Mini Cho Một Người', 'french-press-aeropress-moka-pot', 149000, 360, 'C', 'Kích cỡ nhỏ cho một người dùng, dễ cất trong tủ bếp hoặc ngăn bàn làm việc.', 'french press,mini'],
  ['Bình Moka Pot Nhôm', 'french-press-aeropress-moka-pot', 259000, 380, 'S', 'Bình Moka Pot nhôm kiểu cổ điển, pha trên bếp cho tách cà phê đậm đà.', 'moka pot,nhôm,bếp'],
  ['Bình Moka Pot Inox', 'french-press-aeropress-moka-pot', 389000, 520, 'S', 'Bình Moka Pot inox bền, dùng được nhiều loại bếp, dễ lau chùi.', 'moka pot,inox,bền'],
  ['Dụng Cụ Pha Ép Tay Nhỏ Gọn', 'french-press-aeropress-moka-pot', 289000, 300, '1', 'Dụng cụ pha bằng lực ép tay, gọn nhẹ, dễ mang theo và dễ làm sạch.', 'ép tay,du lịch,gọn nhẹ'],
  ['Bình Pha Siphon Thủy Tinh', 'french-press-aeropress-moka-pot', 890000, 1300, '1', 'Bình siphon thủy tinh cho người thích pha cà phê như một màn trình diễn nhỏ.', 'siphon,thủy tinh,trình diễn'],
  // Máy xay (7)
  ['Máy Xay Tay Lưỡi Gốm', 'may-xay', 289000, 520, 'C', 'Máy xay tay lưỡi gốm, vận hành êm, hợp pha một đến hai tách mỗi lần.', 'máy xay,xay tay,lưỡi gốm'],
  ['Máy Xay Tay Inox Gấp Gọn', 'may-xay', 459000, 600, '1', 'Máy xay tay vỏ inox, tay quay gập gọn, tiện mang theo khi di chuyển.', 'máy xay,xay tay,inox'],
  ['Máy Xay Tay Cho Du Lịch', 'may-xay', 359000, 450, 'C', 'Thiết kế nhỏ gọn, nhẹ, vừa balo, cho người hay pha cà phê ngoài trời.', 'máy xay,xay tay,du lịch'],
  ['Máy Xay Điện Lưỡi Phẳng', 'may-xay', 1290000, 2800, '1', 'Máy xay điện cho nhu cầu xay thường xuyên, cho độ xay đều hơn xay tay.', 'máy xay,điện,lưỡi phẳng'],
  ['Máy Xay Điện Cho Văn Phòng', 'may-xay', 990000, 2200, 'C', 'Máy xay điện kích thước vừa, hợp bàn làm việc hoặc quầy bếp nhỏ.', 'máy xay,điện,văn phòng'],
  ['Máy Xay Mini Dùng Pin Sạc', 'may-xay', 690000, 700, '1', 'Máy xay mini sạc qua cổng USB, tiện khi không có nguồn điện cố định.', 'máy xay,pin sạc,mini'],
  ['Máy Xay Tay Vỏ Gỗ', 'may-xay', 520000, 800, '1', 'Thân gỗ ấm tay, nhìn như một món trang trí cho góc pha cà phê.', 'máy xay,xay tay,gỗ'],
  // Ấm rót, cân & nhiệt kế (7)
  ['Ấm Rót Cổ Ngỗng Inox', 'am-rot-can-nhiet-ke', 349000, 650, 'C', 'Ấm cổ ngỗng giúp rót dòng nước nhỏ và đều, rất hợp pour-over.', 'ấm rót,cổ ngỗng,inox'],
  ['Ấm Rót Cổ Ngỗng Đồng', 'am-rot-can-nhiet-ke', 690000, 780, '1', 'Ấm cổ ngỗng màu đồng, nhìn đẹp mắt, dùng được trên bếp.', 'ấm rót,cổ ngỗng,đồng'],
  ['Ấm Rót Điện Cổ Ngỗng', 'am-rot-can-nhiet-ke', 1190000, 1100, 'C', 'Ấm điện cổ ngỗng đun nhanh, tiện cho người pha cà phê mỗi sáng.', 'ấm rót,điện,cổ ngỗng'],
  ['Cân Pha Chế Mini', 'am-rot-can-nhiet-ke', 249000, 280, '1', 'Cân điện tử nhỏ gọn để cân cà phê và nước, giúp công thức lặp lại ổn định.', 'cân,điện tử,mini'],
  ['Cân Điện Tử Có Hẹn Giờ', 'am-rot-can-nhiet-ke', 489000, 450, '1', 'Cân có sẵn đồng hồ bấm giờ, tiện theo dõi thời gian chiết xuất.', 'cân,hẹn giờ,pha chế'],
  ['Nhiệt Kế Điện Tử Cắm Ấm', 'am-rot-can-nhiet-ke', 159000, 90, '1', 'Nhiệt kế điện tử đọc nhanh, dùng để kiểm tra nhiệt độ nước trước khi pha.', 'nhiệt kế,điện tử'],
  ['Nhiệt Kế Kim Loại Dạng Kẹp', 'am-rot-can-nhiet-ke', 89000, 60, '1', 'Nhiệt kế kim loại có kẹp, gắn vào thành ấm hoặc bình cho tiện theo dõi.', 'nhiệt kế,kẹp,kim loại'],
  // Dụng cụ latte art (5)
  ['Ca Đánh Sữa Inox', 'dung-cu-latte-art', 139000, 220, 'S', 'Ca inox để đánh sữa và rót latte, miệng rót gọn giúp tạo hình dễ hơn.', 'ca đánh sữa,inox,latte art'],
  ['Ca Latte Art Mũi Nhọn', 'dung-cu-latte-art', 189000, 260, 'S', 'Ca có mũi nhọn để vẽ nét mảnh, hợp cho người đang tập latte art.', 'ca latte,mũi nhọn'],
  ['Bút Vẽ Latte Art', 'dung-cu-latte-art', 59000, 40, '1', 'Bút kim loại để kéo và vẽ chi tiết lên bề mặt bọt sữa.', 'bút vẽ,latte art'],
  ['Tamper Inox', 'dung-cu-latte-art', 249000, 380, 'S', 'Tamper inox cầm chắc tay để nén cà phê đều trước khi chiết xuất.', 'tamper,inox,espresso'],
  ['Thảm Tamper Silicon', 'dung-cu-latte-art', 69000, 120, 'C', 'Thảm silicon bảo vệ mặt bàn khi nén cà phê, dễ rửa.', 'thảm tamper,silicon'],
  // Bình cold brew (4)
  ['Bình Cold Brew Thủy Tinh', 'binh-cold-brew', 229000, 700, 'S', 'Bình thủy tinh có nắp kín để ủ cold brew qua đêm trong tủ lạnh.', 'cold brew,thủy tinh,bình ủ'],
  ['Bình Cold Brew Có Lõi Lọc', 'binh-cold-brew', 289000, 800, 'S', 'Có lõi lọc inox tháo rời, rót ra không lẫn bã cà phê.', 'cold brew,lõi lọc,inox'],
  ['Bình Ủ Lạnh Tiết Kiệm', 'binh-cold-brew', 149000, 600, '1', 'Bình nhựa trong bền, phù hợp cho người mới thử cold brew tại nhà.', 'cold brew,tiết kiệm'],
  ['Túi Lọc Cold Brew Bằng Vải', 'binh-cold-brew', 49000, 40, 'P', 'Túi vải mịn dùng lại nhiều lần, bỏ cà phê xay thô vào và ngâm lạnh.', 'cold brew,túi lọc,vải'],
  // Giấy lọc (5)
  ['Giấy Lọc Hình Nón Cỡ Nhỏ', 'giay-loc', 55000, 80, 'P', 'Giấy lọc hình nón cỡ nhỏ, dùng cho phễu pour-over một đến hai tách.', 'giấy lọc,hình nón'],
  ['Giấy Lọc Hình Nón Cỡ Lớn', 'giay-loc', 65000, 110, 'P', 'Giấy lọc hình nón cỡ lớn, hợp phễu pour-over cho nhiều tách.', 'giấy lọc,hình nón'],
  ['Giấy Lọc Đáy Phẳng', 'giay-loc', 75000, 100, 'P', 'Giấy lọc dạng xếp nếp cho phễu đáy phẳng, lọc sạch và dòng chảy ổn định.', 'giấy lọc,đáy phẳng'],
  ['Giấy Lọc Tròn Cho Bình Pha', 'giay-loc', 49000, 70, 'P', 'Giấy lọc tròn dùng thay cho lưới lọc khi pha bằng bình ép hoặc Moka Pot.', 'giấy lọc,tròn'],
  ['Giấy Lọc Không Tẩy Trắng', 'giay-loc', 69000, 90, 'P', 'Giấy lọc màu nâu tự nhiên, nên tráng nước nóng trước khi pha.', 'giấy lọc,không tẩy trắng'],
  // Ly, cốc & bình giữ nhiệt (9)
  ['Ly Sứ Espresso Tráng Men', 'ly-coc-binh-giu-nhiet', 59000, 140, 'C', 'Ly sứ dày, giữ ấm tốt, đúng kiểu ly nhỏ cho tách espresso.', 'ly sứ,espresso'],
  ['Ly Sứ Cappuccino', 'ly-coc-binh-giu-nhiet', 79000, 240, 'C', 'Ly sứ miệng rộng, hợp cappuccino và latte, men bóng dễ rửa.', 'ly sứ,cappuccino'],
  ['Ly Thủy Tinh Hai Lớp', 'ly-coc-binh-giu-nhiet', 119000, 220, 'S', 'Ly thủy tinh hai lớp, cầm không nóng tay, nhìn rõ màu cà phê.', 'ly thủy tinh,hai lớp'],
  ['Ly Thủy Tinh Cao Cho Cold Brew', 'ly-coc-binh-giu-nhiet', 69000, 260, 'P', 'Ly cao thủy tinh, hợp cho cà phê đá và cold brew mùa nóng.', 'ly thủy tinh,cold brew'],
  ['Cốc Giữ Nhiệt Du Lịch', 'ly-coc-binh-giu-nhiet', 259000, 320, 'C', 'Cốc giữ nhiệt có nắp kín, mang đi làm hay đi chơi đều tiện.', 'cốc giữ nhiệt,du lịch'],
  ['Bình Giữ Nhiệt Dung Tích Lớn', 'ly-coc-binh-giu-nhiet', 359000, 620, 'C', 'Bình giữ nhiệt dung tích lớn, đủ dùng cho cả buổi làm việc.', 'bình giữ nhiệt,inox'],
  ['Ly Sứ Có Nắp Gỗ', 'ly-coc-binh-giu-nhiet', 149000, 360, 'C', 'Ly sứ kèm nắp gỗ tự nhiên, giữ ấm và hạn chế bụi.', 'ly sứ,nắp gỗ'],
  ['Bộ Ly Sứ Đôi Kèm Đĩa', 'ly-coc-binh-giu-nhiet', 239000, 700, '1', 'Bộ hai ly sứ kèm đĩa lót, hợp để mời bạn bè hoặc làm quà tân gia.', 'bộ ly,sứ,quà tặng'],
  ['Cốc Gấp Silicon Mang Đi', 'ly-coc-binh-giu-nhiet', 99000, 150, 'C', 'Cốc silicon gấp gọn, nhét vừa túi xách, dùng khi đi cắm trại.', 'cốc silicon,gấp gọn'],
  // Hộp bảo quản & vệ sinh (6)
  ['Hộp Đựng Hạt Hút Chân Không', 'hop-bao-quan-ve-sinh', 249000, 600, 'S', 'Hộp có nắp hút chân không giúp hạt cà phê giữ hương lâu hơn.', 'hộp bảo quản,hút chân không'],
  ['Lọ Thủy Tinh Nắp Kín', 'hop-bao-quan-ve-sinh', 89000, 420, 'S', 'Lọ thủy tinh nắp kín để đựng hạt hoặc bột cà phê trên kệ bếp.', 'lọ thủy tinh,bảo quản'],
  ['Túi Zip Van Một Chiều', 'hop-bao-quan-ve-sinh', 59000, 60, 'P', 'Túi zip có van một chiều cho cà phê vừa rang, thoát khí mà không hút ẩm vào.', 'túi zip,van một chiều'],
  ['Bàn Chải Vệ Sinh Máy Xay', 'hop-bao-quan-ve-sinh', 39000, 45, '1', 'Bàn chải lông mềm để quét bột cà phê còn sót trong máy xay.', 'bàn chải,vệ sinh'],
  ['Viên Tẩy Cặn Dụng Cụ Pha Chế', 'hop-bao-quan-ve-sinh', 99000, 150, 'P', 'Viên tẩy cặn dầu cà phê cho bình pha, phin và ấm, dùng theo hướng dẫn trên bao bì.', 'tẩy cặn,vệ sinh'],
  ['Khăn Lau Microfiber Pha Chế', 'hop-bao-quan-ve-sinh', 69000, 100, 'P', 'Khăn microfiber mềm, thấm tốt, để lau quầy bar và dụng cụ.', 'khăn lau,microfiber'],
  // Phụ kiện quầy bar (5)
  ['Hộp Gõ Bã Cà Phê', 'phu-kien-quay-bar', 169000, 450, '1', 'Hộp gõ bã có thanh chắn, đặt gọn trên quầy hoặc bàn pha chế.', 'hộp gõ bã,quầy bar'],
  ['Thìa Đong Cà Phê Inox', 'phu-kien-quay-bar', 45000, 40, '1', 'Thìa đong cán dài giúp lấy cà phê vừa đủ mỗi lần pha.', 'thìa đong,inox'],
  ['Kẹp Túi Cà Phê', 'phu-kien-quay-bar', 35000, 30, 'P', 'Kẹp giữ miệng túi kín sau khi mở, hạn chế cà phê tiếp xúc không khí.', 'kẹp túi,bảo quản'],
  ['Tạp Dề Barista Vải Dày', 'phu-kien-quay-bar', 189000, 250, 'C', 'Tạp dề vải dày, nhiều túi, hợp cho người pha chế tại nhà hoặc tại quán.', 'tạp dề,barista'],
  ['Khay Đựng Dụng Cụ Bằng Gỗ', 'phu-kien-quay-bar', 219000, 800, '1', 'Khay gỗ chia ngăn để gom tamper, thìa, bút vẽ và các dụng cụ nhỏ.', 'khay gỗ,quầy bar'],
  // Sách & ấn phẩm (3)
  ['Sổ Tay Pha Chế Cà Phê', 'sach-an-pham', 99000, 250, '1', 'Sổ ghi công thức, tỷ lệ pha và cảm nhận từng mẻ, giúp bạn tiến bộ qua mỗi lần pha.', 'sổ tay,công thức'],
  ['Sách Công Thức Cà Phê Việt', 'sach-an-pham', 159000, 400, '1', 'Tuyển tập công thức cà phê kiểu Việt, từ phin truyền thống đến các biến tấu hiện đại.', 'sách,công thức'],
  ['Bộ Thẻ Hương Vị Cà Phê', 'sach-an-pham', 119000, 200, '1', 'Bộ thẻ gợi ý từ vựng mô tả hương vị, giúp bạn gọi tên mùi vị khi nếm cà phê.', 'thẻ hương vị,nếm cà phê'],
  // Quà tặng & combo (4)
  ['Hộp Quà Cà Phê Việt Nhỏ', 'hop-qua-tang', 349000, 900, '1', 'Hộp quà gồm cà phê rang xay và phin, đóng gói sẵn, hợp tặng người thân.', 'hộp quà,cà phê việt'],
  ['Hộp Quà Barista Tại Gia', 'hop-qua-tang', 690000, 1800, '1', 'Hộp quà cho người mới pha cà phê tại nhà: cà phê hạt, phễu và vài phụ kiện cơ bản.', 'hộp quà,barista'],
  ['Combo Phin Và Cà Phê Rang Xay', 'combo-pha-che', 189000, 700, 'C', 'Combo một phin và một gói cà phê rang xay, mua chung rẻ hơn mua lẻ.', 'combo,phin,rang xay'],
  ['Combo Pour-over Cho Người Mới', 'combo-pha-che', 499000, 1500, '1', 'Combo gồm phễu, bình hứng, giấy lọc và cà phê, đủ để pha tách đầu tiên.', 'combo,pour-over,người mới'],
];
