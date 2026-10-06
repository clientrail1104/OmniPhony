-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'QUEUE_MANAGER', 'BILLING_AUDITOR', 'AGENT');

-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('OFFLINE', 'AVAILABLE', 'BUSY', 'BREAK', 'WRAP_UP');

-- CreateEnum
CREATE TYPE "RateKind" AS ENUM ('COST', 'SELL');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('VOICE', 'WEBCHAT', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'SMS', 'EMAIL');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "oidcSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "presence" "Presence" NOT NULL DEFAULT 'OFFLINE',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT,
    "slaSeconds" INTEGER NOT NULL DEFAULT 20,
    "wrapUpSeconds" INTEGER NOT NULL DEFAULT 30,
    "maxWaitSeconds" INTEGER NOT NULL DEFAULT 600,
    "flowId" UUID,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMember" (
    "tenantId" UUID NOT NULL,
    "queueId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "proficiency" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "QueueMember_pkey" PRIMARY KEY ("tenantId","queueId","userId")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "RateKind" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "sha256" CHAR(64) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "prefix" VARCHAR(15) NOT NULL,
    "country" TEXT NOT NULL,
    "connectFee" DECIMAL(20,6) NOT NULL,
    "perMinute" DECIMAL(20,6) NOT NULL,
    "initialSeconds" INTEGER NOT NULL,
    "incrementSeconds" INTEGER NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierTrunk" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gatewayName" TEXT NOT NULL,
    "credentialRef" TEXT NOT NULL,
    "costCardId" UUID NOT NULL,
    "maxChannels" INTEGER NOT NULL,
    "maxCps" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CarrierTrunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "switchId" TEXT NOT NULL,
    "switchUuid" UUID NOT NULL,
    "parentCallId" UUID,
    "conversationId" UUID,
    "agentId" UUID,
    "queueId" UUID,
    "walletId" UUID,
    "carrierId" UUID,
    "destination" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "answeredAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "durationMs" BIGINT NOT NULL DEFAULT 0,
    "billableMs" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "cost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "sell" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "rateSnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "hangupCause" TEXT,
    "finalizedAt" TIMESTAMPTZ,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepaidWallet" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "balance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'PREPAID',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrepaidWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "authorizedUntil" TIMESTAMPTZ NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settledAmount" DECIMAL(20,6),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "walletId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "periodEnd" TIMESTAMPTZ NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "tax" DECIMAL(20,6) NOT NULL,
    "total" DECIMAL(20,6) NOT NULL,
    "taxSnapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "objectKey" TEXT,
    "sha256" TEXT,
    "issuedAt" TIMESTAMPTZ,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "durationMs" BIGINT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelCredential" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "encryptedSecret" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rotatedAt" TIMESTAMPTZ,

    CONSTRAINT "ChannelCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "queueId" UUID,
    "assignedUserId" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "chatwootAccountId" INTEGER,
    "chatwootConversationId" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "body" TEXT,
    "mediaObjectKey" TEXT,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "queueId" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "originalEnqueuedAt" TIMESTAMPTZ NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'WAITING',
    "leaseUntil" TIMESTAMPTZ,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "retainUntil" TIMESTAMPTZ NOT NULL,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "transcript" JSONB,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_oidcSubject_key" ON "User"("tenantId", "oidcSubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_tenantId_id_key" ON "Queue"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_tenantId_name_key" ON "Queue"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RateCard_tenantId_id_key" ON "RateCard"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RateCard_tenantId_name_version_key" ON "RateCard"("tenantId", "name", "version");

-- CreateIndex
CREATE INDEX "Rate_tenantId_prefix_idx" ON "Rate"("tenantId", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Rate_tenantId_cardId_prefix_key" ON "Rate"("tenantId", "cardId", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierTrunk_tenantId_id_key" ON "CarrierTrunk"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierTrunk_tenantId_name_key" ON "CarrierTrunk"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_startedAt_idx" ON "CallLog"("tenantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_tenantId_id_key" ON "CallLog"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_tenantId_switchId_switchUuid_key" ON "CallLog"("tenantId", "switchId", "switchUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PrepaidWallet_tenantId_id_key" ON "PrepaidWallet"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_tenantId_callId_key" ON "Reservation"("tenantId", "callId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_walletId_createdAt_idx" ON "LedgerEntry"("tenantId", "walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_tenantId_idempotencyKey_key" ON "LedgerEntry"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_id_key" ON "Invoice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_walletId_periodStart_periodEnd_key" ON "Invoice"("tenantId", "walletId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_tenantId_callId_key" ON "InvoiceLine"("tenantId", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelCredential_tenantId_channel_providerAccountId_key" ON "ChannelCredential"("tenantId", "channel", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_id_key" ON "Conversation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_channel_externalId_key" ON "Conversation"("tenantId", "channel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_providerEventId_key" ON "Message"("tenantId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_tenantId_id_key" ON "Flow"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_tenantId_name_version_key" ON "Flow"("tenantId", "name", "version");

-- CreateIndex
CREATE INDEX "CallbackRequest_tenantId_state_nextAttemptAt_idx" ON "CallbackRequest"("tenantId", "state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_tenantId_callId_objectKey_key" ON "Recording"("tenantId", "callId", "objectKey");

-- CreateIndex
CREATE INDEX "Outbox_publishedAt_createdAt_idx" ON "Outbox"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_tenantId_queueId_fkey" FOREIGN KEY ("tenantId", "queueId") REFERENCES "Queue"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_tenantId_cardId_fkey" FOREIGN KEY ("tenantId", "cardId") REFERENCES "RateCard"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierTrunk" ADD CONSTRAINT "CarrierTrunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepaidWallet" ADD CONSTRAINT "PrepaidWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tenantId_walletId_fkey" FOREIGN KEY ("tenantId", "walletId") REFERENCES "PrepaidWallet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_walletId_fkey" FOREIGN KEY ("tenantId", "walletId") REFERENCES "PrepaidWallet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelCredential" ADD CONSTRAINT "ChannelCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

