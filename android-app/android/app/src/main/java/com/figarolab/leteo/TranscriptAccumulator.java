package com.figarolab.leteo;

/** The recognizer's partial result replaces only its current segment. */
final class TranscriptAccumulator {
    private String confirmed = "";
    private String partial = "";

    void partial(String text) { partial = clean(text); }

    void segment(String text) {
        String next = clean(text);
        if (next.isEmpty()) return;
        confirmed = join(confirmed, next);
        partial = "";
    }

    boolean finishUtterance(String result) {
        String text = clean(result);
        if (text.isEmpty()) text = partial;
        if (text.isEmpty()) return false;
        segment(text);
        return true;
    }

    String text() { return join(confirmed, partial); }

    private static String clean(String text) { return text == null ? "" : text.trim(); }
    private static String join(String a, String b) { return a.isEmpty() ? b : b.isEmpty() ? a : a + " " + b; }
}
