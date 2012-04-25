## Searching

The most common use of the SDK is to perform searches against your Splunk
instance and fetch those results. The SDK makes this a simple task, providing
useful methods for common operations.

### Splunk's different search modes

Splunk has a few different search modes, and it is useful to understand the 
difference between them and when it is appropriate to use which. These 
are specified by adding an `exec_mode=MODE` parameter to the `POST` request
to the `search/jobs` endpoint.

*   **`exec_mode=normal`**: A normal search is one that is executed
    asynchronously. It will immediately return an instance of the job,
    and a user needs to poll the job if it has completed, and only then
    access the events/results. If preview is enabled for this search,
    you can also ask for previews before the search is completed.
*   **`exec_mode=blocking`**: A blocking search is similar to a
    normal search, with the only exception that it will not return
    until the search has completed. This means that you do not need 
    to poll, but you will also not be able to get previews. You 
    *cannot* use `exec_mode=blocking` with real-time searches.
*   **`exec_mode=oneshot`**: Oneshot searches are the simplest
    and least flexible form of searches. The request will not
    return until the search is complete, and rather than returning a search
    job instance, it will simply return all the results. You *cannot* use
    `exec_mode=oneshot` with real-time searches.

Splunk also has a streaming endpoint at `search/jobs/export`, but the JS SDK
does not support it at the moment.

**Note:** All searches which don't begin with a `|` need to begin with the 
`search` verb. For example, the following query will fail:

    index=_internal sourcetype=splunkd_access
    
However, the following query will succeed:

    search index=_internal sourcetype=splunkd_access
    
Searches that begin with a `|`, however, do not need this:

    | history

### Creating searches

Creating a search can be done very easily. For example, to create a normal
search:

    var svc = ...;
    svc.search("search * | head 10", {}, function(err, job) {
        // search is running and job is the instance of that job 
    });
    
or a blocking search:

    var svc = ...;
    svc.search(
        "search * | head 10", 
        { exec_mode: "blocking" },
        function(err, job) {
            // search is done and job is the instance of that job    
        }
    );
    
or a oneshot search:

    var svc = ...;
    svc.oneshotSearch("search * | head 10", {}, function(err, results) {
        console.log(results); 
    });
    
#### Real-time searches

Creating a real-time search is just as easy. To create a real-time search
that has an infinte window (from now to forever):

    var svc = ...;
    svc.search(
        "search * | head 10", 
        { earliest_time: "rt", latest_time: "rt" }, 
        function(err, job) {
            // search is running and job is the instance of that job    
        }
    );
    
or one with a specific sliding window (say, 10 minutes):

    var svc = ...;
    svc.search(
        "search * | head 10", 
        { earliest_time: "rt-10m", latest_time: "rt" }, 
        function(err, job) {
            // search is running and job is the instance of that job    
        }
    );
    
#### Passing parameters when creating a search

It can be useful to be able to pass parameters when creating a search,
so that you can specify various options, like `earliest_time`, `max_count`,
`status_buckets, etc:

    var svc = ...;
    svc.search(
        "search * | head 10", 
        { earliest_time: "-10m", status_buckets: "300" }, 
        function(err, job) {
            // search is running and job is the instance of that job    
        }
    );
    
#### Getting a search to run in the context of a specific app/user namespace

Searches may need to be executed in the context of a specific app/user, for
example if a lookup is only defined for some app:

    var svc = ...;
    svc.search(
        "search * | head 10", 
        {},
        { app: "MyAwesomeApp", owner: "admin" }, 
        function(err, job) {
            // search is running and job is the instance of that job
        }
    );
    
### Interacting with Searches

Creating a search is all well and good, but usually you want to do something
with the search you just created, such as getting its current status, getting
results, or even cancelling it. These are all defined as methods on the
[`splunkjs.Service.Job`][ref_Job] object.

For the remainder of the topics in this section, we'll assume we have a `job`
variable that references an existing search job.

#### Cancelling searches

Cancelling searches is very simple:

    job.cancel(function(err) {
        // Search is cancelled! 
    });
    
#### Retrieving events, results and previews

The most common operation done with searches is to get the final outcome in some
form. Splunk has three different kinds of "outcomes":

*   **`events`**: these are the raw events that make up the search. For example,
    if you had the following search:
    ```search * | head 10 | stats count```
    Then the `events` represent the events that were used to calculate the
    statistics.
*   **`results`**: these represents the final results for a search. If the
    search is a transforming search (e.g. `stats`, `timechart`, etc), then the
    results are those calculated statics (e.g. in the above search, you'd have
    a single result with a `count` field). If the search is not a transforming
    search, then the results will be the raw events.
*   **`preview`**: just like `results`, except that it will return the
    current preview of the results, assuming previews are enabled.
    
In the REST API directly, these are referred to as `search/jobs/<sid>/events`,
`search/jobs/<sid>/results` and `search/jobs/<sid>/results_preview`, 
respectively. In the SDK, they are the [`events`][ref_Job_events], 
[`results`][ref_Job_results] and [`preview`][ref_Job_preview] methods.

##### Retrieving Events

The `events` method takes two parameters: an object with various options, and a 
callback. The options are things like `count`, `offset`, etc. For example, we
can pass in no options:

    // This will print out the _raw field of every
    // event
    job.events({}, function(err, events) {
        // Find the index of the _raw field
        var rawIndex = events.fields.indexOf("_raw");
        for(var i = 0; i < events.rows.length; i++) {
            console.log("Event " + i + ":", events.rows[i][rawIndex]);
        }
    });

Similarly, you can pass in parameters:

    job.events({count: 5, offset: 2}, function(err, events) {
        // You will get 5 events, starting from offset 2
    });

You can read more about what options are applicable [here](http://docs.splunk.com/Documentation/Splunk/latest/RESTAPI/RESTsearch#search.2Fjobs.2F.7Bsearch_id.7D.2Fevents).

##### Retrieving Results/Preview

`results` are identical to `events`. If our original query was along the lines
of:

    search * | head 10
    
Then `results` and `events` would be identical. However, if the original query
was more like this:

    search * | head 10 | stats count by sourcetype
    
Then `results` would have as many results are there are sourcetypes.

    // This will print out the count and sourcetype
    job.results({}, function(err, results) {
        // Find the indices of the count and sourcetype fields
        var countIndex = results.fields.indexOf("count");
        var sourcetypeIndex = results.fields.indexOf("sourcetype");
        for(var i = 0; i < results.rows.length; i++) {
            var row = results.rows[i];
            var sourectype = row[sourcetypeIndex];
            var count = row[countIndex];
            console.log(sourcetype + ": " + count);
        }
    });
    
Getting preview results is as simple as replacing `results` with `preview` 
(assuming preview is enabled):

    // This will print out the count and sourcetype
    job.preview({}, function(err, results) {
        // Find the indices of the count and sourcetype fields
        var countIndex = results.fields.indexOf("count");
        var sourcetypeIndex = results.fields.indexOf("sourcetype");
        for(var i = 0; i < results.rows.length; i++) {
            var row = results.rows[i];
            var sourectype = row[sourcetypeIndex];
            var count = row[countIndex];
            console.log(sourcetype + ": " + count);
        }
    });

You can pass the same options to `results` and `preview` as well, as detailed [here](http://docs.splunk.com/Documentation/Splunk/latest/RESTAPI/RESTsearch#search.2Fjobs.2F.7Bsearch_id.7D.2Fresults)
for `results`, and [here](http://docs.splunk.com/Documentation/Splunk/latest/RESTAPI/RESTsearch#search.2Fjobs.2F.7Bsearch_id.7D.2Fresults_preview)f or `preview`.

#### A Quick Note about Formats

As you can see above, `events`, `results` and `preview` come in a particular
format (similar to CSV). This is known as `json_rows`, and is the default
in the JS SDK. There are three formats:

##### `json_rows`

The default format, which looks like this:

    {
        "fields": [
            "field_1",
            "field_2",
            "field_3"
        ], 
        "init_offset": 0, 
        "messages": {}, 
        "preview": false, 
        "rows": [
            ["row1_field1", "row1_field2", "row1_field3"],
            ["row2_field1", "row2_field2", "row2_field3"],
            ...
        ]
    }
    
##### `json_cols`

Similar to `json_rows`, just transposed:

    {
        "fields": [
            "field_1",
            "field_2",
            "field_3"
        ], 
        "init_offset": 0, 
        "messages": {}, 
        "preview": false, 
        "columns": [
            ["row1_field1", "row2_field1", "row3_field1"],
            ["row1_field2", "row2_field2", "row3_field2"],
            ...
        ]
    }
    
#### `json`

`json` is a more verbose format:

    [
        {
            "field_1": "row1_field1",
            "field_2": "row1_field2",
            "field_3": "row1_field3"
        },
        {
            "field_1": "row2_field1",
            "field_2": "row2_field2",
            "field_3": "row2_field3"
        },
        ...
    ]

[ref_Job]: https://TODO.com
[ref_Job_events]: https://TODO.com
[ref_Job_results]: https://TODO.com
[ref_Job_preview]: https://TODO.com