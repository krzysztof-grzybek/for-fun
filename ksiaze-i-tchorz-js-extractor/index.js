import { readFileSync, writeFileSync } from 'fs';
import { readdir, mkdir } from 'node:fs/promises';
import { cwd } from 'node:process';
import path from "node:path";

const files = await findDatabanks(cwd() + '/' + process.argv[2]);

await mkdir(cwd() + '/' + process.argv[3]).catch(() => {
    console.error("rooms-output directory already exists, exiting.");
    process.exit(1)
});

files.forEach((file, index) => {
    extractRoom(file, cwd() + '/' + process.argv[3] +`/${index}.bmp`);
});

async function findDatabanks(rootDir) {
    const results = [];

    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase() === "databank.ptc") {
                results.push(fullPath);
            }
        }
    }

    await walk(rootDir);
    return results;
}

function extractRoom(file, outputPath) {
    const table1 = [
        0x8000, 0x0002,
        0x4000, 0x0004,
        0x2000, 0x0008,
        0x1000, 0x0010,
        0x0800, 0x0020,
        0x0400, 0x0040,
        0x0200, 0x0080,
        0x0100, 0x0100,
        0x0080, 0x0200,
        0x0040, 0x0400
    ];

    const table2 = [
        0x0000F000,
        0x0020FC00,
        0x00A0FF00,
        0x02A0FF80,
        0x06A0FFC0,
        0x0EA0FFE0,
        0x1EA0FFF0,
        0x3EA0FFF8
    ];

    const table3 = [
        0x8000, 0x0000,
        0x4000, 0x0002,
        0x2000, 0x0006,
        0x1000, 0x000E,
        0x0800, 0x001E,
        0x0400, 0x003E,
        0x0200, 0x007E,
        0x0100, 0x00FE,
        0x0080, 0x01FE,
        0x0040, 0x03FE,
        0x0020, 0x07FE,
        0x0010, 0x0FFE,
        0x0008, 0x1FFE,
        0x0004, 0x3FFE,
        0x0002, 0x7FFE,
        0x0001, 0xFFFE
    ];

    const buffer = readFileSync(file);

    const tableOffset = buffer.readUInt32LE(4) ^ 0x4D4F4B2D;
    const tableSize = buffer.readUInt32LE(8) ^ 0x534F4654;

    const table = buffer.subarray(tableOffset, tableOffset + tableSize);

    decrypt(table);

    let position = 0;

    const fileEntries = []
    while (table.length > position) {

        const offset = table.readUInt32LE(position + 24)
        const size = table.readUInt32LE(position + 28)

        let internalPosition = position
        let fileName = '';
        let byte;
        do {
            byte = table[internalPosition++];

            if (byte === 0) {
                break;
            }

            fileName += String.fromCharCode(byte);
        } while (internalPosition < position + 32);

        fileEntries.push({fileName, offset, size});
        position += 32;
    }

    const myFileEntry = fileEntries.find(e => e.fileName === 'ROOM');

    if (myFileEntry === undefined) {
        console.warn(`Room file is missing in ${file}, skipping.`);
        return;
    }


    const magicBeforeCompressedData = buffer.readUInt32BE(myFileEntry.offset).toString(16);
    if (magicBeforeCompressedData !== "4d41534d") {
        throw new Error('Something went wrong');
    }

    const decompLen = buffer.readUInt32BE(myFileEntry.offset + 14);
    const myFileCompressed = buffer.subarray(myFileEntry.offset + 18, myFileEntry.offset + myFileEntry.size);

    const myFile = decompress(myFileCompressed, decompLen);

    writeFileSync(outputPath, myFile);

    function decrypt(buffer) {
        let key = 0xDEADF00D;

        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = buffer[i] + (key & 0xFF);
            key = key ^ 0x2E84299A;
            key = (key + 0x424C4148) >>> 0;
            key = (((key & 1) << 31) | (key >>> 1));
        }
    }

    function decompress(source, destSize) {
        const src = Buffer.from(source);
        const dest = Buffer.alloc(destSize);
        let srcPosition = 0;
        let dstPosition = 0;
        let bitBuffer = 0x80;

        function getBit() {
            let bit = (bitBuffer & 0x80) >>> 7;
            bitBuffer = (bitBuffer << 1) & 0xFF;

            if (bitBuffer === 0) {
                bitBuffer = src[srcPosition++];
                bit = (bitBuffer & 0x80) >>> 7;
                bitBuffer = ((bitBuffer << 1) | 1) & 0xFF;
            }

            return bit;
        }

        while (dstPosition < destSize) {
            let ebp;
            let offset;
            let length;
            let more;

            if (getBit()) {
                if (getBit()) {
                    if (getBit()) {
                        if (getBit()) {
                            if (getBit()) {
                                if (getBit()) {
                                    let tableIndex = 0;
                                    while (getBit()) {
                                        tableIndex++;
                                    }

                                    length = table3[tableIndex * 2];
                                    do {
                                        more = !(length & 0x8000);
                                        length = ((length << 1) | getBit()) & 0xFFFF;
                                    } while (more);

                                    length = (length + table3[tableIndex * 2 + 1]) & 0xFFFF;
                                    length = (length + 1) & 0xFFFF;
                                    src.copy(dest, dstPosition, srcPosition, srcPosition + length);
                                    srcPosition += length;
                                    dstPosition += length;
                                }
                                dest[dstPosition++] = src[srcPosition++];
                            }
                            dest[dstPosition++] = src[srcPosition++];
                        }
                        dest[dstPosition++] = src[srcPosition++];
                    }
                    dest[dstPosition++] = src[srcPosition++];
                }
                dest[dstPosition++] = src[srcPosition++];
            }

            if (!getBit()) {
                if (getBit()) {
                    let tableIndex = getBit();
                    tableIndex = (tableIndex << 1) | getBit();
                    tableIndex = (tableIndex << 1) | getBit();
                    ebp = table2[tableIndex];
                    length = 1;
                } else {
                    ebp = 0x0000FF00;
                    length = 0;
                }
            } else {
                let tableIndex = 0;
                while (getBit()) {
                    tableIndex++;
                }

                length = table1[tableIndex * 2];
                do {
                    more = !(length & 0x8000);
                    length = ((length << 1) | getBit()) & 0xFFFF;
                } while (more);

                length = (length + table1[tableIndex * 2 + 1]) & 0xFFFF;
                tableIndex = getBit();
                tableIndex = (tableIndex << 1) | getBit();
                tableIndex = (tableIndex << 1) | getBit();
                ebp = table2[tableIndex];
            }

            offset = ebp & 0xFFFF;
            do {
                if (bitBuffer === 0x80) {
                    if (offset >= 0xFF00) {
                        offset = ((offset << 8) | src[srcPosition++]) & 0xFFFF;
                    }
                }

                more = offset & 0x8000;
                offset = ((offset << 1) | getBit()) & 0xFFFF;
            } while (more);

            offset = (offset + (ebp >>> 16)) & 0xFFFF;
            length = (length + 2) & 0xFFFF;

            while (length--) {
                if (dstPosition >= destSize) {
                    return dest;
                }

                dest[dstPosition] = dest[dstPosition - offset];
                dstPosition++;
            }
        }

        return dest;
    }
}
