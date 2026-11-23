/*
 * Kho câu/tên cho seed nhiều (D-084). Dữ liệu giả, tiếng Việt tự nhiên; việc chọn câu do PRNG tất định quyết định.
 * Module thuần dữ liệu (không chạm DB).
 */

export const HO = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
] as const;

export const MALE_MIDDLE = ['Văn', 'Minh', 'Quốc', 'Hữu', 'Đức', 'Gia', 'Thanh', 'Anh'] as const;
export const FEMALE_MIDDLE = [
  'Thị',
  'Ngọc',
  'Thu',
  'Kim',
  'Thanh',
  'Mai',
  'Bảo',
  'Phương',
] as const;

export const MALE_GIVEN = [
  'An',
  'Bình',
  'Dũng',
  'Hiếu',
  'Hùng',
  'Khoa',
  'Long',
  'Nam',
  'Phúc',
  'Quân',
  'Quang',
  'Sơn',
  'Trung',
  'Tuấn',
  'Việt',
  'Đạt',
  'Khải',
  'Tâm',
  'Thịnh',
  'Hải',
] as const;
export const FEMALE_GIVEN = [
  'Châu',
  'Giang',
  'Hà',
  'Hạnh',
  'Lan',
  'Linh',
  'Mai',
  'Phương',
  'Thảo',
  'Trang',
  'Vy',
  'Yến',
  'Hương',
  'Ngân',
  'Nhi',
  'Oanh',
  'Trinh',
  'Uyên',
  'My',
  'Thư',
] as const;

export const STREETS = [
  'Lê Lợi',
  'Nguyễn Huệ',
  'Trần Hưng Đạo',
  'Hai Bà Trưng',
  'Lý Thường Kiệt',
  'Phan Chu Trinh',
  'Điện Biên Phủ',
  'Nguyễn Trãi',
  'Hoàng Diệu',
  'Võ Thị Sáu',
  'Nguyễn Văn Cừ',
  'Pasteur',
  'Lạc Long Quân',
  'Trường Chinh',
  'Cách Mạng Tháng Tám',
  'Nguyễn Thị Minh Khai',
  'Lê Duẩn',
  'Hùng Vương',
] as const;

export const CANCEL_NOTES_CUSTOMER = [
  'Đổi ý, không muốn mua nữa',
  'Đặt nhầm sản phẩm',
  'Muốn đổi địa chỉ giao hàng',
  'Tìm được giá tốt hơn',
] as const;
export const CANCEL_NOTES_STORE = [
  'Hết hàng',
  'Không liên lạc được với khách',
  'Cửa hàng hủy đơn',
] as const;
export const CARRIERS = ['GHN', 'GHTK', 'Viettel Post'] as const;

export type ReviewGroup = 'coffee' | 'tool' | 'accessory';

export const REVIEW_OPEN_POSITIVE = [
  'Giao hàng nhanh, đóng gói cẩn thận.',
  'Mình đã dùng được một thời gian rồi.',
  'Mua lần thứ hai và vẫn hài lòng.',
  'Đặt buổi tối, hôm sau đã nhận được hàng.',
  'Shop tư vấn nhiệt tình nên mình chọn đúng loại.',
  'Hàng đúng như mô tả trên web.',
  '',
] as const;
export const REVIEW_OPEN_NEUTRAL = [
  'Nhìn chung dùng ổn.',
  'Sản phẩm ở mức chấp nhận được.',
  'Giao hàng đúng hẹn.',
] as const;
export const REVIEW_OPEN_NEGATIVE = [
  'Mình hơi thất vọng một chút.',
  'Chưa được như kỳ vọng của mình.',
  'Trải nghiệm lần này chưa tốt.',
] as const;

export const REVIEW_BODY_POSITIVE: Record<ReviewGroup, readonly string[]> = {
  coffee: [
    'Hạt thơm, mở túi là thấy mùi rất dễ chịu.',
    'Pha lên vị cân bằng, hậu ngọt, uống mỗi sáng rất đã.',
    'Ngày rang ghi rõ trên túi nên mình yên tâm về độ tươi.',
    'Vị đậm đà đúng gu của mình, pha phin rất ngon.',
    'Pha pour-over ra hương trái cây rất rõ, chua dịu dễ uống.',
    'Xay xong thơm cả bếp, uống không bị gắt.',
    'Cho cả nhà dùng thử, ai cũng khen dễ uống.',
  ],
  tool: [
    'Làm việc chắc chắn, cầm vừa tay, dễ vệ sinh.',
    'Chất liệu tốt, hoàn thiện gọn gàng, dùng mấy tuần chưa thấy vấn đề gì.',
    'Thiết kế đẹp, đặt trên quầy bếp nhìn rất gọn.',
    'Dùng rất tiện, người mới như mình cũng làm quen nhanh.',
    'Giá hợp lý so với chất lượng nhận được.',
    'Pha cà phê ổn định hơn hẳn so với dụng cụ cũ của mình.',
  ],
  accessory: [
    'Đóng gói kỹ, sản phẩm nhìn xinh và dùng tiện.',
    'Mua về dùng hằng ngày, rất đáng tiền.',
    'Chất lượng tốt hơn mình nghĩ, sẽ ủng hộ shop tiếp.',
    'Mình mua làm quà, người nhận rất thích.',
    'Gọn nhẹ, dễ cất giữ, đúng thứ mình đang cần.',
  ],
};
export const REVIEW_BODY_NEUTRAL: Record<ReviewGroup, readonly string[]> = {
  coffee: [
    'Vị uống được nhưng chưa nổi bật so với kỳ vọng.',
    'Hương thơm vừa phải, hợp pha nhanh vào buổi sáng.',
  ],
  tool: [
    'Dùng được, nhưng phần hoàn thiện chưa thật tinh tế.',
    'Đúng chức năng, không có gì đặc biệt.',
  ],
  accessory: ['Tạm ổn so với giá tiền.', 'Dùng được, đóng gói có thể gọn hơn.'],
};
export const REVIEW_BODY_NEGATIVE: Record<ReviewGroup, readonly string[]> = {
  coffee: [
    'Vị hơi gắt so với mình mong đợi, có lẽ không hợp khẩu vị.',
    'Mình thấy hương thơm nhạt hơn mô tả.',
  ],
  tool: ['Phần hoàn thiện chưa kỹ lắm, mình hơi tiếc.', 'Dùng thử vài lần thì thấy chưa vừa tay.'],
  accessory: [
    'Chất lượng chưa như hình, mình hơi thất vọng.',
    'Sản phẩm dùng tạm được nhưng chưa đáng giá tiền.',
  ],
};
export const REVIEW_CLOSE_POSITIVE = [
  'Sẽ ủng hộ shop tiếp.',
  'Chắc chắn sẽ mua lại.',
  'Giới thiệu cho bạn bè rồi.',
  'Cho 5 sao nhé!',
  '',
  '',
] as const;
export const REVIEW_CLOSE_NEGATIVE = [
  'Mong shop cải thiện thêm.',
  'Hy vọng lần sau tốt hơn.',
  '',
] as const;

export const ADMIN_REPLY_POSITIVE = [
  'Cảm ơn bạn đã ủng hộ BeanBox, chúc bạn pha được nhiều tách ngon!',
  'BeanBox rất vui vì bạn hài lòng, hẹn gặp lại bạn ở đơn tiếp theo.',
  'Cảm ơn bạn đã chia sẻ, bên mình sẽ giữ chất lượng như vậy.',
] as const;
export const ADMIN_REPLY_NEGATIVE = [
  'BeanBox xin lỗi vì trải nghiệm chưa tốt. Bạn vui lòng liên hệ cửa hàng để được hỗ trợ nhé.',
  'Cảm ơn góp ý của bạn, bên mình sẽ chuyển cho bộ phận liên quan để cải thiện.',
] as const;

export const CONTACT_SUBJECTS = [
  'Hỏi về đơn hàng',
  'Tư vấn chọn cà phê',
  'Đổi trả sản phẩm',
  'Hợp tác bán sỉ',
  'Góp ý website',
  'Thanh toán chuyển khoản',
] as const;
export const CONTACT_MESSAGES: Record<(typeof CONTACT_SUBJECTS)[number], readonly string[]> = {
  'Hỏi về đơn hàng': [
    'Mình đã đặt đơn từ hôm qua, cho mình hỏi khi nào đơn được giao ạ?',
    'Mình muốn đổi địa chỉ nhận hàng cho đơn vừa đặt, nhờ shop hỗ trợ giúp mình.',
    'Đơn của mình hiển thị đang xử lý hơi lâu, shop kiểm tra giúp mình nhé.',
  ],
  'Tư vấn chọn cà phê': [
    'Mình hay pha phin và thích vị đậm, ít chua. Shop gợi ý giúp mình loại nào phù hợp ạ?',
    'Mình mới tập pha pour-over, nên bắt đầu với loại hạt nào để dễ pha?',
    'Mình cần cà phê cho văn phòng khoảng chục người uống, shop tư vấn giúp mình nhé.',
  ],
  'Đổi trả sản phẩm': [
    'Mình nhận được sản phẩm bị móp hộp, mình muốn đổi sang sản phẩm khác được không ạ?',
    'Mình đặt nhầm loại xay, shop cho mình hỏi có đổi lại được không?',
  ],
  'Hợp tác bán sỉ': [
    'Quán mình đang mở ở Đà Nẵng, muốn lấy cà phê hạt số lượng đều mỗi tháng. Shop có chính sách giá sỉ không ạ?',
    'Mình muốn đặt số lượng lớn dụng cụ pha chế cho lớp học, nhờ shop báo giúp mình.',
  ],
  'Góp ý website': [
    'Trang giỏ hàng trên điện thoại mình thấy nút hơi nhỏ, mong shop xem lại giúp.',
    'Mình thấy website dễ dùng, nhưng mong có thêm bộ lọc theo mức rang cho dễ chọn.',
  ],
  'Thanh toán chuyển khoản': [
    'Mình đã chuyển khoản cho đơn hàng nhưng chưa thấy cập nhật, shop kiểm tra giúp mình nhé.',
    'Cho mình hỏi nội dung chuyển khoản cần ghi như thế nào để shop xác nhận nhanh ạ?',
  ],
};
export const CONTACT_ADMIN_NOTES = [
  'Đã gọi lại cho khách, hướng dẫn xong.',
  'Chuyển bộ phận kho kiểm tra.',
  'Khách đồng ý đổi sản phẩm, chờ gửi hàng.',
  'Trả lời qua email.',
] as const;

export const ORDER_NOTES = [
  'Khách gọi xác nhận lại địa chỉ giao hàng.',
  'Đã đóng gói, chờ shipper đến lấy.',
  'Khách yêu cầu giao trong giờ hành chính.',
  'Kiểm tra lại tồn kho trước khi giao.',
  'Khách hàng quen, ưu tiên xử lý sớm.',
  'Đã nhắn tin xác nhận đơn qua điện thoại.',
  'Gói quà theo yêu cầu, thêm thiệp viết tay.',
  'Giao thất bại lần đầu, hẹn giao lại vào chiều mai.',
] as const;
