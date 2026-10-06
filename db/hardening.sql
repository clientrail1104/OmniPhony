-- Apply AFTER prisma migrate deploy, as database owner. Runtime role is never owner.
-- Provision cc_app LOGIN separately with your secret manager. No password in this file.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "PrepaidWallet" ADD CONSTRAINT wallet_values CHECK (
  reserved >= 0 AND "creditLimit" >= 0 AND balance + "creditLimit" >= reserved
  AND mode IN ('PREPAID','POSTPAID') AND (mode <> 'PREPAID' OR "creditLimit"=0));
ALTER TABLE "Rate" ADD CONSTRAINT rate_values CHECK (
  "connectFee">=0 AND "perMinute">=0 AND "initialSeconds" BETWEEN 1 AND 3600
  AND "incrementSeconds" BETWEEN 1 AND 3600 AND prefix ~ '^[1-9][0-9]{0,14}$');
ALTER TABLE "RateCard" ADD CONSTRAINT rate_window CHECK ("effectiveTo" IS NULL OR "effectiveTo">"effectiveFrom");
ALTER TABLE "RateCard" ADD CONSTRAINT no_published_overlap EXCLUDE USING gist
  ("tenantId" WITH =,name WITH =,tstzrange("effectiveFrom","effectiveTo",'[)') WITH &&)
  WHERE ("publishedAt" IS NOT NULL);
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_values CHECK (amount>=0 AND state IN ('ACTIVE','SETTLED'));
ALTER TABLE "CallLog" ADD CONSTRAINT cdr_values CHECK ("durationMs">=0 AND "billableMs">=0 AND cost>=0 AND sell>=0);
ALTER TABLE "QueueMember" ADD CONSTRAINT proficiency_range CHECK (proficiency BETWEEN 1 AND 5);
-- Composite FKs protect against cross-tenant references even in service SQL.
ALTER TABLE "CarrierTrunk" ADD FOREIGN KEY ("tenantId","costCardId") REFERENCES "RateCard"("tenantId",id);
ALTER TABLE "CallLog" ADD FOREIGN KEY ("tenantId","agentId") REFERENCES "User"("tenantId",id);
ALTER TABLE "CallLog" ADD FOREIGN KEY ("tenantId","queueId") REFERENCES "Queue"("tenantId",id);
ALTER TABLE "CallLog" ADD FOREIGN KEY ("tenantId","walletId") REFERENCES "PrepaidWallet"("tenantId",id);
ALTER TABLE "CallLog" ADD FOREIGN KEY ("tenantId","carrierId") REFERENCES "CarrierTrunk"("tenantId",id);
ALTER TABLE "Reservation" ADD FOREIGN KEY ("tenantId","callId") REFERENCES "CallLog"("tenantId",id);
ALTER TABLE "Invoice" ADD FOREIGN KEY ("tenantId","walletId") REFERENCES "PrepaidWallet"("tenantId",id);
ALTER TABLE "InvoiceLine" ADD FOREIGN KEY ("tenantId","callId") REFERENCES "CallLog"("tenantId",id);
ALTER TABLE "Conversation" ADD FOREIGN KEY ("tenantId","queueId") REFERENCES "Queue"("tenantId",id);
ALTER TABLE "Conversation" ADD FOREIGN KEY ("tenantId","assignedUserId") REFERENCES "User"("tenantId",id);
ALTER TABLE "Message" ADD FOREIGN KEY ("tenantId","conversationId") REFERENCES "Conversation"("tenantId",id);
ALTER TABLE "Queue" ADD FOREIGN KEY ("tenantId","flowId") REFERENCES "Flow"("tenantId",id);
ALTER TABLE "CallbackRequest" ADD FOREIGN KEY ("tenantId","queueId") REFERENCES "Queue"("tenantId",id);
ALTER TABLE "Recording" ADD FOREIGN KEY ("tenantId","callId") REFERENCES "CallLog"("tenantId",id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['User','Queue','QueueMember','RateCard','Rate','CarrierTrunk','CallLog',
  'PrepaidWallet','Reservation','LedgerEntry','Invoice','InvoiceLine','ChannelCredential',
  'Conversation','Message','Flow','CallbackRequest','Recording','Outbox','AuditEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = nullif(current_setting(''app.tenant_id'',true),)::uuid) WITH CHECK ("tenantId" = nullif(current_setting(app.tenant_id,true),)::uuid)',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO cc_app',t);
  END LOOP;
END $$;
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_tenant ON "Tenant" USING (id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON "Tenant" TO cc_app;
REVOKE UPDATE,DELETE ON "LedgerEntry","AuditEvent" FROM cc_app;
REVOKE ALL ON "ChannelCredential" FROM cc_app;
-- A separate narrowly granted connector role decrypts channel secrets. Never the web API.
-- Administrative cross-tenant operations use audited per-tenant transactions, not RLS bypass.
