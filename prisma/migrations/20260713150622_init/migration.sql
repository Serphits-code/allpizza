-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NOVO', 'EM_PREPARO', 'EM_ROTA', 'PRONTO_RETIRADA', 'ENTREGUE', 'COMANDA_MESA');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'RETIRADA', 'COMANDA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'CREDITO', 'DEBITO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'KITCHEN');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PizzaCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceP" DOUBLE PRECISION NOT NULL,
    "priceM" DOUBLE PRECISION NOT NULL,
    "priceG" DOUBLE PRECISION NOT NULL,
    "priceGG" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PizzaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PizzaFlavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "pizzaCategoryId" TEXT NOT NULL,

    CONSTRAINT "PizzaFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NOVO',
    "type" "OrderType" NOT NULL DEFAULT 'DELIVERY',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerAddress" TEXT,
    "addressNumber" TEXT,
    "reference" TEXT,
    "customerLat" DOUBLE PRECISION,
    "customerLng" DOUBLE PRECISION,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "changeFor" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "readyForPickupAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "isPizza" BOOLEAN NOT NULL DEFAULT false,
    "pizzaSize" TEXT,
    "crustType" TEXT,
    "crustPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemFlavor" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "flavorName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,

    CONSTRAINT "OrderItemFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContactProfile" (
    "id" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "notes" TEXT,
    "displayNameOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContactProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'KITCHEN',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrustType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePM" DOUBLE PRECISION NOT NULL,
    "priceGGG" DOUBLE PRECISION NOT NULL,
    "caracol" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrustType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PizzaCategory_name_key" ON "PizzaCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerContactProfile_phoneKey_key" ON "CustomerContactProfile"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CrustType_name_key" ON "CrustType"("name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PizzaFlavor" ADD CONSTRAINT "PizzaFlavor_pizzaCategoryId_fkey" FOREIGN KEY ("pizzaCategoryId") REFERENCES "PizzaCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemFlavor" ADD CONSTRAINT "OrderItemFlavor_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
