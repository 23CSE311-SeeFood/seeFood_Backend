async function clearCartItemsForStudent(db, studentId, canteenItemIds = []) {
  if (!studentId) return;
  if (!Array.isArray(canteenItemIds) || canteenItemIds.length === 0) return;
  const cart = await db.cart.findUnique({ where: { studentId } });
  if (!cart) return;
  await db.cartItem.deleteMany({
    where: { cartId: cart.id, canteenItemId: { in: canteenItemIds } },
  });
  const remaining = await db.cartItem.findMany({
    where: { cartId: cart.id },
    include: { canteenItem: true },
  });
  const total = remaining.reduce(
    (sum, item) => sum + item.quantity * (item.canteenItem?.price || 0),
    0
  );
  await db.cart.update({ where: { id: cart.id }, data: { total } });
}

module.exports = { clearCartItemsForStudent };
