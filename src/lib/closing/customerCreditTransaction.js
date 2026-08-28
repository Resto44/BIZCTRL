export const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const calculateCustomerCreditAfterTransaction = ({
  currentOutstanding,
  creditSale,
  debtPayment,
}) => {
  const outstanding = toNonNegativeNumber(currentOutstanding);
  const sale = toNonNegativeNumber(creditSale);
  const payment = Math.min(toNonNegativeNumber(debtPayment), outstanding + sale);

  return {
    currentDebt: outstanding,
    creditSale: sale,
    payment,
    afterTransaction: Math.max(0, outstanding + sale - payment),
  };
};

export const customerCreditDisplayOption = (customer) => ({
  id: customer?.id,
  name: customer?.customer_name || customer?.name || '',
  identifier: customer?.phone || customer?.customer_code || '',
});
