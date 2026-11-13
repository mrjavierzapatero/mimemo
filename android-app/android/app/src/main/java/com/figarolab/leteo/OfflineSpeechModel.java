package com.figarolab.leteo;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.vosk.Model;

/** Installs the bundled Spanish model in the app's private directory on first use. */
final class OfflineSpeechModel {
    private static final String MODEL = "vosk-model-small-es-0.42";

    static synchronized Model open(Context context) throws IOException {
        File parent = context.getNoBackupFilesDir();
        File model = new File(parent, MODEL);
        if (!model.isDirectory()) {
            File staging = new File(parent, MODEL + ".unpacking");
            delete(staging);
            if (!staging.mkdirs()) throw new IOException("Cannot create model staging directory");
            try {
                unpack(context, staging);
                File extracted = new File(staging, MODEL);
                if (!extracted.renameTo(model)) throw new IOException("Cannot install Spanish model");
            } finally {
                delete(staging);
            }
        }
        return new Model(model.getAbsolutePath());
    }

    private static void unpack(Context context, File staging) throws IOException {
        String prefix = staging.getCanonicalPath() + File.separator;
        try (ZipInputStream archive = new ZipInputStream(context.getAssets().open("leteo-model-es.zip"))) {
            byte[] buffer = new byte[16384];
            for (ZipEntry entry; (entry = archive.getNextEntry()) != null;) {
                File target = new File(staging, entry.getName());
                if (!target.getCanonicalPath().startsWith(prefix)) throw new IOException("Invalid model entry");
                File directory = entry.isDirectory() ? target : target.getParentFile();
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create model directory");
                if (!entry.isDirectory()) {
                    try (FileOutputStream output = new FileOutputStream(target)) {
                        for (int count; (count = archive.read(buffer)) != -1;) output.write(buffer, 0, count);
                    }
                }
                archive.closeEntry();
            }
        }
    }

    private static void delete(File path) {
        File[] children = path.listFiles();
        if (children != null) for (File child : children) delete(child);
        path.delete();
    }
}
