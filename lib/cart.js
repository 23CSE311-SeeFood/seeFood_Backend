async function clearCartForStudent(db, studentId) {
  if (!studentId) return;
  const cart = await db.cart.findUnique({ where: { studentId } });
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({ where: { id: cart.id }, data: { total: 0 } });
}

module.exports = { clearCartForStudent };
