-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "scopeId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "scopeType" TEXT;

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'upload',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorMessage" TEXT,
    "sections" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_name_key" ON "DocumentCategory"("name");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_categoryId_checksum_key" ON "Document"("categoryId", "checksum");
