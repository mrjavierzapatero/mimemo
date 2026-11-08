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

    void terminal(String text) {
        String next = clean(text);
        if (next.isEmpty()) return;
        if (confirmed.isEmpty() || next.equals(confirmed) || next.startsWith(confirmed + " ")) {
            confirmed = next;
        } else {
            confirmed = join(confirmed, next);
        }
        partial = "";
    }

    String text() { return join(confirmed, partial); }

    private static String clean(String text) { return text == null ? "" : text.trim(); }
    private static String join(String a, String b) { return a.isEmpty() ? b : b.isEmpty() ? a : a + " " + b; }
}
