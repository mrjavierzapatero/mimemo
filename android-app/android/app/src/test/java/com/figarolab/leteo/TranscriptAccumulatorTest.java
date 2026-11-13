package com.figarolab.leteo;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class TranscriptAccumulatorTest {
    @Test public void partialsReplaceRatherThanRepeat() {
        TranscriptAccumulator transcript = new TranscriptAccumulator();
        transcript.partial("quiero");
        transcript.partial("quiero que");
        transcript.partial("quiero que guardes");
        assertEquals("quiero que guardes", transcript.text());
    }

    @Test public void pauseRetainsThursdayWhileNextSegmentChanges() {
        TranscriptAccumulator transcript = new TranscriptAccumulator();
        transcript.partial("todos los jueves");
        transcript.segment("Todos los jueves");
        transcript.partial("a las tres");
        transcript.partial("a las tres y cuarenta y cinco tengo clase de piano");
        assertEquals("Todos los jueves a las tres y cuarenta y cinco tengo clase de piano", transcript.text());
        transcript.segment("a las tres y cuarenta y cinco tengo clase de piano");
        assertEquals("Todos los jueves a las tres y cuarenta y cinco tengo clase de piano", transcript.text());
    }

    @Test public void finalTimeoutStillRetainsLastPartial() {
        TranscriptAccumulator transcript = new TranscriptAccumulator();
        transcript.segment("Mañana a la una");
        transcript.partial("enviar email a Ticare");
        transcript.segment("");
        assertEquals("Mañana a la una enviar email a Ticare", transcript.text());
    }

    @Test public void finalResultAfterPauseKeepsTheFirstUtterance() {
        TranscriptAccumulator transcript = new TranscriptAccumulator();
        transcript.partial("Mañana a la una");
        transcript.finishUtterance("");
        transcript.partial("enviar email");
        transcript.finishUtterance("enviar email a Ticare");
        assertEquals("Mañana a la una enviar email a Ticare", transcript.text());
    }

    @Test public void deliberateRepeatedSegmentsArePreserved() {
        TranscriptAccumulator transcript = new TranscriptAccumulator();
        transcript.segment("Ticare");
        transcript.segment("Ticare");
        assertEquals("Ticare Ticare", transcript.text());
    }
}
