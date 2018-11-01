const MH_QUBIC = "FGLJGYZNYWJU9CBZTDTQJVBYCAZCZD9SEAOCJIVNKZF9HVGBTEQLWXB9TONZFSXCJATMAORELVIQDT999";
const channels = [];
var last_fetched_mh_epoch = -1;
var mhqubic_loaded = false;

window.onbeforeunload = function (e) {

    let unsettled_channels = false;

    channels.forEach(function (channel) {
        if(channel.state !== "settled" && channel.to_own && !channel.from_own)
            unsettled_channels = true;
    });

    if(unsettled_channels) {
        const message = "You have unsettled channels. If you leave now, your channel partner might close the channel without you being able to claim your profits. Are you sure that you want to leave?";
        warning(message);
        return message;
    }
};

function create_mhc(deposit_epoch, step) {

    $('#hashtable_hl').addClass("hidden");
    $hashtable.addClass("hidden");

    action_start($create_mhc_button);

    QLITE.fetch_epoch(function (res, err) {
        action_finish($create_mhc_button);
        const tqn_transfer = fetched_epoch_to_json(res, deposit_epoch, "contain any transfers");
        if(!tqn_transfer) return;

        var problem_with_hashes = false;
        var any_transfers = false;
        tqn_transfer['transfers'].forEach(function (transfer) {
            if(!any_transfers && transfer['receiver'] === MH_QUBIC && transfer['type'] === "QUBIC") {
                const secret_hash = sha256(Math.random() + "." + Math.random() + "." + Math.random() + "." + Math.random());
                const hashes = create_hashes(secret_hash, transfer['value'], step);
                if(!hashes) problem_with_hashes = true;
                show_microhashes(hashes, step);
                copy_to_clipboard(secret_hash);
                window.prompt("Here is your secret hash. Keep it safe and secret. You will need it to make payments.", secret_hash);
                console.log(secret_hash);
                send_mhc_opening_request(deposit_epoch, step, hashes[0]);
                any_transfers = true;
            }
        });

        if(problem_with_hashes)
            return;
        if(!any_transfers)
            error("the microhash smart contract did not receive any deposits in epoch #" + deposit_epoch);

    }, QUBIC, deposit_epoch);
}

function create_mhc_if_not_existent() {

    const step = parseInt($('#step').val());

    const deposit_epoch = parseInt($('#deposit_epoch').val());

    _ParameterValidator.validate_integer(step, 'TQN/microhash', 1, 2147483647);
    _ParameterValidator.validate_integer(deposit_epoch, 'deposit epoch', 0, 2147483647);

    action_start($create_mhc_button);
    QLITE.qubic_consensus(function (res, err) {
        action_finish($create_mhc_button);
        if(!res) return;
        if(res['result']) {
            const opening_epoch = parse_result_to_json(res['result'])['epoch'];
            warning("a channel based on this deposit has already been opened in epoch #" + opening_epoch);
            return;
        }

        create_mhc(deposit_epoch, step);

    }, MH_QUBIC, "OPENED", deposit_epoch);
}

function send_mhc_opening_request(deposit_epoch, step, start_hash) {
    const mhc_payer_index = parseInt($('#mhc_payer_index').val());
    const mhc_payee = $('#mhc_payee').val().toUpperCase();
    const mhc_payee_index = parseInt($('#mhc_payee_index').val());

    _ParameterValidator.validate_tryte_sequence(mhc_payee, 'payee', 81, 81);
    _ParameterValidator.validate_integer(mhc_payer_index, 'payer index', 0, 2147483647);
    _ParameterValidator.validate_integer(mhc_payee_index, 'payee index', 0, 2147483647);

    const request = {
        "deposit_epoch": deposit_epoch,
        "from": sender, "from_index": mhc_payer_index,
        "to": mhc_payee, "to_index": mhc_payee_index,
        "start_hash": start_hash,
        "step": step
    };

    const index = parseInt(new Date()/1000);
    action_start($create_mhc_button);
    QLITE.iam_write(function (res, err) {
        action_finish($create_mhc_button);
        if(res) success("A request to open a new microhash channel has been sent successfully.");
        promote_mhrequest(sender, index, "IAM");
    }, sender, index, request);

}

function create_hashes(secret_hash, value, step) {
    const hash_count = Math.floor(value / step);
    if(hash_count > 100000) {
        error('too many microhashes: ' + hash_count + ", please increase tqn/µ#");
        return null;
    }
    const microhashes = [hash_count];
    microhashes[hash_count] = secret_hash;
    for(let i = hash_count-1; i >= 0; i--)
        microhashes[i] = sha256(microhashes[i+1]);
    return microhashes;
}

function show_microhashes(microhashes, step) {

    if(microhashes.length > 300)
        return toastr.warning("not showing microhash table because it exceeds the practical length of 300");

    $hashtable.html($('<tr>')
        .append($('<th>').text("TQN value"))
        .append($('<th>').text("microhash")));
    microhashes.forEach(function (microhash, index) {
        $hashtable.append($('<tr>')
            .append($('<td>').text((index*step).toLocaleString()))
            .append($('<td>').text(microhash)));
    });
    $hashtable.removeClass("hidden");
    $('#hashtable_hl').removeClass("hidden");
}

function load_mhc() {
    const opening_epoch = parseInt($('#mhc_opening_epoch').val());
    _ParameterValidator.validate_integer(opening_epoch, 'opening epoch', 0, 2147483647);

    action_start($load_mhc_button);
    QLITE.fetch_epoch(function (res, err) {
        action_finish($load_mhc_button);

        const opening = fetched_epoch_to_json(res, opening_epoch, "open up a new channel");
        if(!opening) return;

        if(opening['error_type'])
            return error("an error occured in epoch #" + opening_epoch + ": " + opening['error_type']);
        if(!opening['deposit_epoch'])
            return error("epoch #" + opening_epoch + " does not upen up a new channel, but settles an old channel.");

        var already_loaded = false;
        channels.forEach(function (mhc, index) {
            if(mhc.opening_epoch === opening_epoch)
                already_loaded = true;
        });
        if(already_loaded)
            return warning("the channel from epoch #"+opening_epoch+" is already loaded");

        add_mhc(opening, opening_epoch, false, null);

    }, MH_QUBIC, opening_epoch);
}

function generate_channel_account_cell(id, index, own) {
    const icon = new Identicon(md5(id), 60).toString();
    const $account_cell = $('<td>').addClass("account").append('<img class="identicon" width=60 height=60 src="data:image/png;base64,' + icon + '"><p>'+id+'/'+index+'</p>');
    if(own) $account_cell.addClass("own");
    return $account_cell;
}

function promote_mhrequest(sender, sender_index, type) {

    const promotion_message = {"sender": sender, "index": sender_index, "type": type, "topic": "microhash"};
    $('#loading_screen').removeClass("hidden");

    QLITE.import(function (res, err) {
        QLITE.iam_write(function (res, err) {
            $('#loading_screen').addClass("hidden");
            if(err) return;
            QLITE.iam_delete(function (res, err) { }, "AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999");
            success("request promoted");
        }, "AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999", 0, promotion_message);
    }, "i_AOKR9YPJWBOMNZERYMBLSBZUFOBLMA9LFVGFNQBFGRZWECFJSJICEUELNMLXSYAFMYWOG9FTND9VHT999_GUACEZHVFAEZEYGUACEZGQFEFFGOAGHSDAHCFCEZGUACEZGDFAABABEYEVJVIDABGBJLFQGNICDRHUBCGSEEDWDZEOFPCDICHGEHHOEYCPGCHJAACCIBGKIZHPINHKGGIBETIJHHANIIESCLCRENCGGUEOCXBBIFJCDJABHFAAGBGYJFEKIWIQCDJBAZIABLBKBFBFEAFCJRFOGGCOHZCHBPDJEWCDCSFZEQHFIHDZCSBOBMFTFNFCETADEODFCRGCCPFAGZIEFRIKFUARGWEOJLELBUGPIRDJGOEHEKGGFBFXBDDDHSEZCTFAFTEYAXIQIAAPFTGHFJCYBYASCFACBIEDAEFJEIIIGAENFAABABEYEPDTBGAFDIBBHHDQCXCIBRIMHACEIHCFJPAUBVCHESHEECACERIHHWFJHHFFACIXIBIJIHAOCGDGIJHZDYJHFFFOABAACAHTFUJHGHEAHWGMFUFRCDDBFHGWAMCUBMDTHGFUJQALIEJSANGMDSBJBUGCGPBZBMJLARJEBJJVFJESGFGZISEJETISJQEZGIHFCYBKEJCKBOIBAQAJBOADDRDTIKDXBFFEASALIWIOAAJRIFGJIUEZHWHFEWDBHTGOFCFUFAFSHSARGICQJPCZJKFNELFDFIFMBFDHJCICIWHVGWHY");
}

function monitor_mhqubic() {
    QLITE.qubic_read(function (res, err) {
        if(!res) {
            const msg = "Failed to read meta data of MicroHash smart contract. Please reload the page to try again. Error: <br/><br/>" + JSON.stringify(err);
            $('.page').addClass("hidden");
            $('body').append($('<div>').addClass("page").append($('<h1>').text("ERROR")).append($('<p>').html(msg)));
            return error(msg);
        }
        mhqubic_loaded = true;
        if(accounts_loaded && mhqubic_loaded)
            $('#loading_screen').addClass("hidden");

        const es = res['execution_start']*1000;
        const ed = (res['hash_period_duration'] + res['result_period_duration'])*1000;

        const running = new Date() - es;
        const mc_until_next_epoch = ed - running%ed;

        setTimeout(function () {

            const interval_function = function(){
                const running = new Date() - es;
                const last_completed_epoch = Math.floor(running / ed)-1;
                check_mh_epoch(last_completed_epoch);
            };

            setInterval(interval_function, ed);
            interval_function();

        }, mc_until_next_epoch+1500);

    }, MH_QUBIC);
}

function check_mh_epoch(epoch) {

    QLITE.fetch_epoch(function (res, err) {
        if(!res) {
            console.log(err);
            return error("Failed to load epoch #"+epoch+" of microhash smart contract. If any channel is being settled, you will be unable to claim your funds.");
        }
        if(last_fetched_mh_epoch < epoch-1 && last_fetched_mh_epoch >= 0) {
            warning("Giving epoch #" + (epoch-1) + " a second try to load because it failed a few seconds ago.");
            check_mh_epoch(epoch-1);
        }
        last_fetched_mh_epoch = Math.max(last_fetched_mh_epoch, epoch);
        const fetch = fetched_epoch_to_json(res, epoch, null);

        if(!fetch) return;

        if(fetch['from'])
            on_opening_epoch(fetch, epoch);
        if(fetch['opening_epoch'])
            on_closing_epoch(fetch, epoch);
        if(fetch['outputs'])
            on_settlement_epoch(fetch['epoch_link']['position'], epoch);

    }, MH_QUBIC, epoch);
}

function on_opening_epoch(fetch, epoch) {
    add_mhc(fetch, epoch, true, function () {
        success("The creation of a new channel you are participating in has been detected. The channel was added to your channel list.");
    });
}

function add_mhc(opening, opening_epoch, add_only_if_own, callback) {
    QLITE.iam_list(function(res, err) {
        if(!res) return;
        const new_channel = new MHChannel(opening, opening_epoch, res['list']);
        if(!add_only_if_own || new_channel.to_own || new_channel.from_own) {
            channels.push(new_channel);
            $channels.append(new_channel.$row);
            $('#mhc_count').text(channels.length);
            if(callback) callback();
        }
    });
}

function on_settlement_epoch(opening_epoch, epoch) {

    channels.forEach(function (channel) {
        if(channel.opening_epoch === opening_epoch) {
            channel.state = "settled";
            channel.settlement_epoch = epoch;
            channel.repaint();
            success("channel #"+channel.opening_epoch+" settled, promoting outgoing transfers of smart contract ...");
            channel.promote();
        }
    });
}

function on_closing_epoch(fetch, epoch) {
    channels.forEach(function (channel) {
        if(channel.opening_epoch === fetch['opening_epoch'] && channel.to_own) {
            if(channel.state !== "closing") warning("detected closure of channel (#"+channel.opening_epoch+"), submitting latest microhash for settlement ...");
            channel.state = "closing";
            channel.publish_microhash(epoch-2);
            channel.repaint();
        }
    });
}

class MHChannel {

    constructor(opening, opening_epoch, iams) {
        this.opening_epoch = opening_epoch;
        this.deposit_index = opening['receiving_index'];
        this.state = "open";

        this.from = opening['from'];
        this.from_index = opening['from_index'];
        this.from_own = iams.indexOf(this.from) >= 0;

        this.to = opening['to'];
        this.to_index = opening['to_index'];
        this.to_own = iams.indexOf(this.to) >= 0;

        this.start_hash = opening['start_hash'];
        this.value = opening['value'];
        this.step = opening['step'];
        this.microhash = this.start_hash;
        this.microhash_index = 0;

        const this_mhc = this;
        this.$row = $('<tr>').addClass("channel").attr("id", "channel_"+this.opening_epoch);
        this.$pay_button = $('<input>').attr("type", "button").val("pay").click(function () { this_mhc.pay(); });
        this.$settle_button = $('<input>').attr("type", "button").val("settle").click(function () { this_mhc.settle(); });
        this.$claim_button = $('<input>').attr("type", "button").val("claim").click(function () { this_mhc.claim() });
        this.$remove_button = $('<input>').attr("type", "button").val("remove").click(function () { this_mhc.remove(); });
        this.$promote_button = $('<input>').attr("type", "button").val("promote").click(function () { success("promoting toqen withdrawal ..."); this_mhc.promote(); });
        this.repaint();

        QLITE.qubic_consensus(function (res, err) {
            if(res && res['result']) {
                const json = parse_result_to_json(res['result']);
                if(!json) return;
                this_mhc.state = "settled";
                this_mhc.settlement_epoch = json['epoch'];
                this_mhc.repaint()

            } else QLITE.qubic_consensus(function (res, err) {
                if(res && res['result']) {
                    this_mhc.state = "closing";
                    this_mhc.repaint()
                }
            }, MH_QUBIC, "CLOSING", opening_epoch);

        }, MH_QUBIC, "SETTLED", opening_epoch);

    }

    settle() {

        if(!this.from_own && !this.to_own)
            return error("You do not participate in this channel.");
        if(this.state !== "open")
            return error("Cannot settle, because channel is not open anymore.");

        const request = {"microhash": this.microhash, "opening_epoch": this.opening_epoch };
        const index = parseInt(new Date()/1000);
        const this_mhc = this;

        action_start(this.$settle_button);
        QLITE.qubic_consensus(function (res, err) {
            action_finish(this_mhc.$settle_button);
            if(!res) return;
            if(res['result'])
                return warning("This channel has already been settled.");

            action_start(this_mhc.$settle_button);
            QLITE.iam_write(function (res, err) {
                action_finish(this_mhc.$settle_button);
                if(res) success("A settlement request has been sent sucessfully.");
                promote_mhrequest(this_mhc.from, index, "IAM");

            }, this_mhc.from, index, request);
        }, MH_QUBIC, "SETTLED", this.opening_epoch);
    }

    publish_microhash() {
        const index = this.opening_epoch;
        const mh_this = this;
        QLITE.iam_write(function (res, err) {
            if(res) success("Latest microhash of channel #"+mh_this.opening_epoch+" has been published to claim "+(mh_this.microhash_index * mh_this.step).toLocaleString()+" TQN.");
        }, this.to, index, {'microhash': this.microhash}, "MICROHASH");
    }

    pay() {
        if(!this.hashes) {
            const secret_hash = window.prompt("secret hash:");
            _ParameterValidator.validate_alphanumeric(secret_hash, "secret hash");
            const hashes = create_hashes(secret_hash, this.value, this.step);
            if(hashes[0] !== this.start_hash)
                return toastr.error("secret hash is incorrect");
            if(!hashes) return;
            this.hashes = hashes;
        }
        const pay_value = parseInt(window.prompt("total pay value in TQN:"));
        _ParameterValidator.validate_integer(pay_value, "total pay value", 0, this.value);
        const hash_index = Math.ceil(pay_value/this.step);
        copy_to_clipboard(this.hashes[hash_index]);
        toastr.success("copied microhash for " +(this.step*hash_index).toLocaleString() + " TQN to clipbard");
    }

    claim() {

        if(!this.to_own)
            return error("You are not the payee of this channel.");
        if(this.state !== "open")
            return error("Cannot claim, because channel is not open anymore.");

        let new_microhash = window.prompt("new microhash:");
        if(new_microhash === "") return;
        action_start(this.$claim_button);
        let hash = new_microhash;
        let i = 0;
        for(; i < 100001 && hash !== this.start_hash; i++)
            hash = sha256(hash);
        action_finish(this.$claim_button);
        if(i === 100001)
            return warning("Invalid microhash");
        if(i * this.step > this.value)
            return warning("Rejected microhash that makes false promises.");
        if(i >= this.microhash_index) {
            success("claimed " + ((i-this.microhash_index)*this.step).toLocaleString() + " TQN");
            this.microhash = new_microhash;
            this.microhash_index = i;
            this.repaint();
        } else {
            return warning("The microhash entered is worth less than the current one.");
        }
    }

    promote() {
        promote_transfer(MH_QUBIC, this.settlement_epoch, "QUBIC");
    }

    remove() {
        const index = channels.indexOf(this);
        if (index > -1) channels.splice(index, 1);
        this.$row.remove();
    }

    repaint() {
        const this_mhc = this;
        const $row = $("<div>");
        $row.append($('<td>').text("#"+this.opening_epoch + (this.state === "settled" ? "-" + this.settlement_epoch : "")));
        $row.append($('<td>').text(this.state));
        $row.append(generate_channel_account_cell(this.from, this.from_index, this.from_own));
        $row.append(generate_channel_account_cell(this.to, this.to_index, this.to_own));

        $row.append($('<td>').html(
            this.microhash.substr(0, 16) + "<br/>" +
            this.microhash.substr(16, 16) + "<br/>" +
            this.microhash.substr(32, 16) + "<br/>" +
            this.microhash.substr(48, 16) + "<br/>"
        ));
        $row.append($("<td>")
            .append($("<label>").html(
                ((this.to_own && this.state === "open") ? (this.microhash_index * this.step).toLocaleString() : "?")
                +"/"+this.value.toLocaleString()
                +"<br/><br/><a target='_blank' href='https://qubiota.com/toqen/?account="+MH_QUBIC+"&account_index="+this_mhc.deposit_index+"&type=qubic'>&rarr; explorer</a>"
            )));
        const $button_cell = $("<td>");
        if(this.from_own && this.state === "open") $button_cell.append(this.$pay_button).append($('<br/>'));
        if(this.to_own && this.state === "open") $button_cell.append(this.$claim_button).append($('<br/>'));
        if((this.to_own||this.from_own) && this.state === "open") $button_cell.append(this.$settle_button).append($('<br/>'));
        if(this.state === "settled") $button_cell.append(this.$promote_button).append($('<br/>'));
        $button_cell.append(this.$remove_button);
        $row.append($button_cell);

        this.$row.html("");
        this.$row.append($row.children());
    }
}