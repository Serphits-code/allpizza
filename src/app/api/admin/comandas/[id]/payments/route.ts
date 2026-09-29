import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/pricing";
import { authenticateApiRequest } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

interface ComandaPaymentRecord {
  id: string;
  method: "PIX" | "DINHEIRO" | "DEBITO" | "CREDITO";
  amount: number;
  changeFor?: number | null;
  troco?: number | null;
  notes?: string | null;
  createdAt: string;
}

// GET /api/admin/comandas/:id/payments - Consulta consumo, pagamentos e saldo restante
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const { id } = params;

  try {
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { notIn: ["ENTREGUE", "CANCELADO"] } },
          select: { total: true },
        },
      },
    });

    if (!comanda) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    const totalConsumption = roundCurrency(comanda.orders.reduce((sum, o) => sum + (o.total || 0), 0));

    const config = await prisma.systemConfig.findUnique({
      where: { key: `comanda_payments_${id}` },
    });

    const payments: ComandaPaymentRecord[] = config ? JSON.parse(config.value || "[]") : [];
    const totalPaid = roundCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
    const remainingBalance = Math.max(0, roundCurrency(totalConsumption - totalPaid));
    const isFullyPaid = totalConsumption > 0 && remainingBalance <= 0.01;

    return NextResponse.json({
      success: true,
      comandaNumber: comanda.number,
      responsibleName: comanda.responsibleName,
      status: comanda.status,
      totalConsumption,
      totalPaid,
      remainingBalance,
      isFullyPaid,
      payments,
    });
  } catch (error) {
    console.error("Get comanda payments error:", error);
    return NextResponse.json({ error: "Erro ao consultar pagamentos da comanda" }, { status: 500 });
  }
}

// POST /api/admin/comandas/:id/payments - Registra uma baixa parcial/total na comanda
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const { id } = params;

  try {
    const body = await request.json();
    const { method, amount, changeFor, notes } = body;

    const parsedAmount = roundCurrency(parseFloat(amount || "0"));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Informe um valor válido maior que zero" }, { status: 400 });
    }

    const validMethods = ["PIX", "DINHEIRO", "DEBITO", "CREDITO"];
    if (!validMethods.includes(method)) {
      return NextResponse.json({ error: "Forma de pagamento inválida" }, { status: 400 });
    }

    let parsedChangeFor: number | null = null;
    let troco: number | null = null;

    if (method === "DINHEIRO" && changeFor !== undefined && changeFor !== null) {
      parsedChangeFor = roundCurrency(parseFloat(changeFor || "0"));
      if (!isNaN(parsedChangeFor) && parsedChangeFor > parsedAmount) {
        troco = roundCurrency(parsedChangeFor - parsedAmount);
      }
    }

    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { notIn: ["ENTREGUE", "CANCELADO"] } },
          select: { total: true },
        },
      },
    });

    if (!comanda) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    const totalConsumption = roundCurrency(comanda.orders.reduce((sum, o) => sum + (o.total || 0), 0));

    const config = await prisma.systemConfig.findUnique({
      where: { key: `comanda_payments_${id}` },
    });

    const currentPayments: ComandaPaymentRecord[] = config ? JSON.parse(config.value || "[]") : [];

    const newPayment: ComandaPaymentRecord = {
      id: "pay_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      method,
      amount: parsedAmount,
      changeFor: parsedChangeFor,
      troco,
      notes: notes ? String(notes).trim() : null,
      createdAt: new Date().toISOString(),
    };

    const updatedPayments = [...currentPayments, newPayment];

    await prisma.systemConfig.upsert({
      where: { key: `comanda_payments_${id}` },
      create: { key: `comanda_payments_${id}`, value: JSON.stringify(updatedPayments) },
      update: { value: JSON.stringify(updatedPayments) },
    });

    const totalPaid = roundCurrency(updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0));
    const remainingBalance = Math.max(0, roundCurrency(totalConsumption - totalPaid));
    const isFullyPaid = totalConsumption > 0 && remainingBalance <= 0.01;

    return NextResponse.json({
      success: true,
      message: `Baixa de R$ ${parsedAmount.toFixed(2)} (${method}) registrada!`,
      newPayment,
      totalConsumption,
      totalPaid,
      remainingBalance,
      isFullyPaid,
      payments: updatedPayments,
    });
  } catch (error) {
    console.error("Create comanda payment error:", error);
    return NextResponse.json({ error: "Erro ao registrar pagamento na comanda" }, { status: 500 });
  }
}

// DELETE /api/admin/comandas/:id/payments?paymentId=... - Remove um pagamento registrado por engano
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, ["ADMIN", "MANAGER", "GARCOM"]);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Não autorizado" }, { status: 401 });
  }

  const { id } = params;
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return NextResponse.json({ error: "ID do pagamento é obrigatório" }, { status: 400 });
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: `comanda_payments_${id}` },
    });

    if (!config) {
      return NextResponse.json({ error: "Nenhum pagamento registrado nesta comanda" }, { status: 404 });
    }

    const currentPayments: ComandaPaymentRecord[] = JSON.parse(config.value || "[]");
    const updatedPayments = currentPayments.filter((p) => p.id !== paymentId);

    await prisma.systemConfig.update({
      where: { key: `comanda_payments_${id}` },
      data: { value: JSON.stringify(updatedPayments) },
    });

    return NextResponse.json({
      success: true,
      message: "Pagamento estornado com sucesso",
      payments: updatedPayments,
    });
  } catch (error) {
    console.error("Delete comanda payment error:", error);
    return NextResponse.json({ error: "Erro ao remover pagamento" }, { status: 500 });
  }
}
