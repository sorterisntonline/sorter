#[derive(Debug, Clone, Copy)]
pub(super) enum Color {
    Error = 0x00ED_4245,
    Success = 0x0057_F287,
}

impl From<Color> for u32 {
    #[expect(
        clippy::as_conversions,
        reason = "Color representation is statically known"
    )]
    fn from(color: Color) -> Self {
        color as Self
    }
}
